'use strict';

const mockPrisma = {
  lifecycleSent: { findUnique: jest.fn(), create: jest.fn() },
  notification: { create: jest.fn() },
  user: { findMany: jest.fn(), findFirst: jest.fn() },
  subscription: { findMany: jest.fn() },
  verification: { count: jest.fn() },
  agentMemoryEntry: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
};
const mockTrack = jest.fn();
jest.mock('../../lib/prisma', () => mockPrisma);
jest.mock('../../lib/growth-events', () => ({ track: mockTrack }));

const lifecycle = require('../../lib/lifecycle-triggers');
const conformity = require('../../lib/conformity');
const templates = require('../../lib/email-templates');
const policy = require('../../lib/entity-policy');
const memory = require('../../lib/agent-memory');
const csrf = require('../../lib/csrf');

describe('lifecycle automation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.lifecycleSent.findUnique.mockResolvedValue(null);
    mockPrisma.lifecycleSent.create.mockResolvedValue({});
    mockPrisma.notification.create.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.subscription.findMany.mockResolvedValue([]);
    mockPrisma.verification.count.mockResolvedValue(0);
  });

  afterEach(() => lifecycle.stopScheduler());

  test('validates, deduplicates, and records lifecycle notifications', async () => {
    await expect(lifecycle.send(null, 'kind')).resolves.toEqual({ ok: false, reason: 'invalid_args' });
    mockPrisma.lifecycleSent.findUnique.mockResolvedValueOnce({ id: 'sent' });
    await expect(lifecycle.send('user-1', 'kind')).resolves.toEqual({ ok: true, deduped: true });

    await expect(lifecycle.send('user-1', 'kind', {
      title: 'Act now', message: 'Complete setup', orgId: 'org-1', properties: { step: 1 },
    })).resolves.toEqual({ ok: true });
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: 'user-1', title: 'Act now', metadata: JSON.stringify({ step: 1 }),
    }) });
    expect(mockPrisma.lifecycleSent.create).toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith(expect.objectContaining({
      name: 'kind.sent', userId: 'user-1', orgId: 'org-1', source: 'system',
    }));
  });

  test('nudges only inactive day-one users', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'new-user', orgId: 'org-1' },
      { id: 'active-user', orgId: 'org-1' },
      { id: 'already-sent', orgId: 'org-1' },
    ]);
    mockPrisma.lifecycleSent.findUnique.mockImplementation(async ({ where }) =>
      where.userId_kind.userId === 'already-sent' ? { id: 'existing' } : null);
    mockPrisma.verification.count.mockImplementation(async ({ where }) => where.userId === 'active-user' ? 1 : 0);

    await expect(lifecycle._processDay1(new Date('2026-08-09T12:00:00Z'))).resolves.toBe(1);
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
  });

  test('notifies the first user of trials ending soon', async () => {
    const trialEndsAt = new Date('2026-08-10T12:00:00Z');
    mockPrisma.subscription.findMany.mockResolvedValue([
      { orgId: 'org-1', planId: 'pro', trialEndsAt },
      { orgId: 'empty-org', planId: 'pro', trialEndsAt },
    ]);
    mockPrisma.user.findFirst.mockImplementation(async ({ where }) =>
      where.orgId === 'org-1' ? { id: 'owner', orgId: 'org-1' } : null);
    await expect(lifecycle._processTrialEnding(new Date('2026-08-09T12:00:00Z'))).resolves.toBe(1);
    expect(mockTrack).toHaveBeenCalledWith(expect.objectContaining({
      name: `${lifecycle.KINDS.TRIAL_ENDING}.sent`, userId: 'owner',
    }));
  });

  test('starts only one scheduler and can stop it', () => {
    jest.useFakeTimers();
    const timer = lifecycle.startScheduler({ intervalMs: 1000 });
    expect(timer).toBeTruthy();
    expect(lifecycle.startScheduler({ intervalMs: 1000 })).toBe(timer);
    lifecycle.stopScheduler();
    lifecycle.stopScheduler();
    jest.useRealTimers();
  });
});

describe('EU AI Act conformity workflow', () => {
  test('builds a complete canonical draft and summarizes progress', () => {
    const state = conformity.buildTemplate();
    const initial = conformity.summarise(state);
    expect(state).toMatchObject({ version: conformity.VERSION, status: 'draft' });
    expect(initial.total).toBeGreaterThan(20);
    expect(initial).toMatchObject({ satisfied: 0, readyForAttestation: false, completionPercentage: 0 });
  });

  test('updates evidence, validates status, and rejects unknown items', () => {
    const state = conformity.buildTemplate();
    expect(conformity.updateItem(state, 'rms-1', {
      status: 'in_progress', evidence: 'x'.repeat(5000),
    })).toMatchObject({ status: 'in_progress', evidence: 'x'.repeat(4000) });
    expect(() => conformity.updateItem(state, 'rms-1', { status: 'invalid' })).toThrow('Invalid status');
    expect(() => conformity.updateItem(state, 'missing', {})).toThrow('not found');
  });

  test('blocks incomplete attestation and signs a fully decided assessment', () => {
    const state = conformity.buildTemplate();
    expect(() => conformity.attest(state, { signedBy: 'user-1' })).toThrow(expect.objectContaining({ code: 'not_ready' }));
    for (const section of state.sections) {
      for (const item of section.items) conformity.updateItem(state, item.id, { status: 'satisfied', evidence: 'Evidence' });
    }
    expect(conformity.summarise(state)).toMatchObject({
      completionPercentage: 100, readyForAttestation: true, blockingFailures: 0,
    });
    expect(conformity.attest(state, {
      signedBy: 'user-1', signatureName: 'Ada', signatureRole: 'Provider',
    })).toMatchObject({ status: 'attested', signedBy: 'user-1', signatureName: 'Ada' });
  });

  test('counts failed and not-applicable decisions correctly', () => {
    const state = conformity.buildTemplate();
    conformity.updateItem(state, 'rms-1', { status: 'failed' });
    conformity.updateItem(state, 'rms-2', { status: 'not_applicable' });
    expect(conformity.summarise(state)).toMatchObject({
      failed: 1, notApplicable: 1, blockingFailures: 1, readyForAttestation: false,
    });
  });
});

describe('transactional email rendering', () => {
  const base = {
    platform_name: 'Fixture & Co', public_url: 'https://example.test',
    support_email: 'support@example.test', token: 'a token', name: '<Ada>',
  };

  test.each([
    ['verifyEmail', { token: 'verify token' }],
    ['passwordReset', { token: 'reset token' }],
    ['welcome', {}],
    ['invite', { inviter_name: 'Grace', org_name: 'Research', role: 'admin', token: 'invite' }],
    ['invoice', { amount: '$10.00', plan: 'Pro', period: 'August', invoice_number: 'INV-1', invoice_url: 'https://example.test/invoice' }],
    ['alert', { severity: 'critical', title: 'Incident', message: '<unsafe>', url: 'https://example.test/incident', context: { id: 1 } }],
    ['test', { sent_at: '2026-08-09T12:00:00Z' }],
  ])('%s emits safe HTML and a plain-text alternative', (name, vars) => {
    const rendered = templates[name]({ ...base, ...vars });
    expect(rendered.subject).toEqual(expect.any(String));
    expect(rendered.html).toContain('<!doctype html>');
    expect(rendered.html).not.toContain('<Ada>');
    expect(rendered.text).toEqual(expect.any(String));
  });

  test('renders structured Article 6 verdict evidence safely', () => {
    const rendered = templates.article6Verdict({ ...base, useCaseDescription: '<screening>', verdict: {
      risk: 'high', deadline: '2027-08-02',
      reasoning: [{ title: 'Classification', description: 'Annex III', article: '6' }],
      obligations: ['Human oversight', { title: 'Logging', article: '12' }],
      citations: [{ title: 'AI Act', article: '6' }],
    } });
    expect(rendered.subject).toContain('High');
    expect(rendered.html).toContain('Human oversight');
    expect(rendered.html).not.toContain('<screening>');
    expect(rendered.text).toContain('Key obligations');
  });
});

describe('entity access policy primitives', () => {
  const entity = {
    fields: ['title', 'status'], computed: ['score'],
    writableBy: { status: ['reviewer'] }, anonymous: true, readableBy: ['reviewer'],
  };

  test('scopes reads and strips non-writable fields', () => {
    expect(policy.scope({ user: { id: 'u1', orgId: 'org-1' } }, { active: true }, entity))
      .toEqual({ active: true, orgId: 'org-1' });
    expect(policy.scope({ user: { id: 'u1' } }, null, { anonymous: false })).toEqual({ userId: 'u1' });
    expect(policy.pick({ title: 'T', status: 'open', score: 99 }, entity.fields))
      .toEqual({ title: 'T', status: 'open' });
  });

  test('enforces maker-checker and anonymous-read roles', () => {
    expect(policy.fieldPolicyViolations({ user: { role: 'member' } }, entity, { status: 'approved' }))
      .toEqual(['status']);
    expect(policy.fieldPolicyViolations({ user: { role: 'reviewer' } }, entity, { status: 'approved' })).toEqual([]);
    expect(policy.fieldPolicyViolations({ user: { role: 'admin' } }, entity, { status: 'approved' })).toEqual([]);
    expect(policy.canReadAnonymous({ user: { role: 'member' } }, entity)).toBe(false);
    expect(policy.canReadAnonymous({ user: { role: 'reviewer' } }, entity)).toBe(true);
    expect(policy.canReadAnonymous({ user: { role: 'admin' } }, entity)).toBe(true);
  });

  test('projects identity out of anonymous reads', () => {
    expect(policy.readSelect(entity)).toEqual({
      id: true, createdAt: true, updatedAt: true, title: true, status: true, score: true,
    });
    expect(policy.readSelect({ anonymous: false })).toBeUndefined();
    expect(policy.canReadAnonymous({}, { anonymous: false })).toBe(true);
  });
});

describe('durable agent memory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.agentMemoryEntry.findMany.mockResolvedValue([]);
    mockPrisma.agentMemoryEntry.create.mockResolvedValue({});
    mockPrisma.agentMemoryEntry.deleteMany.mockResolvedValue({ count: 1 });
  });

  test('remembers bounded text and ranks relevant conversation turns', async () => {
    const ns = `memory-${Date.now()}`;
    expect(memory.remember(ns, 'user', 'Research mitochondrial health')).toBe(1);
    expect(memory.remember(ns, 'assistant', 'Unrelated account note')).toBe(2);
    expect(memory.remember(ns, 'assistant', 'Mitochondrial research summary')).toBe(3);
    expect(memory.recall(ns, 'mitochondrial research', 2).map(turn => turn.content)).toEqual([
      'Mitochondrial research summary', 'Research mitochondrial health',
    ]);
    expect(memory.history(ns, 1)).toEqual([
      expect.objectContaining({ role: 'assistant', content: 'Mitochondrial research summary' }),
    ]);
    expect(memory.stats(ns)).toEqual({ namespace: ns, count: 3 });
    expect(memory.clear(ns)).toBe(3);
    expect(memory.stats(ns).count).toBe(0);
    await new Promise(resolve => setImmediate(resolve));
    expect(mockPrisma.agentMemoryEntry.create).toHaveBeenCalledTimes(3);
    expect(mockPrisma.agentMemoryEntry.deleteMany).toHaveBeenCalledWith({ where: { session: ns } });
  });

  test('hydrates persisted turns once and merges them with process memory', async () => {
    const ns = `hydrated-${Date.now()}`;
    mockPrisma.agentMemoryEntry.findMany.mockResolvedValueOnce([{
      role: 'user', content: 'Persisted context', createdAt: new Date('2026-08-09T12:00:00Z'),
    }]);
    expect(memory.history(ns)).toEqual([]);
    await new Promise(resolve => setImmediate(resolve));
    expect(memory.history(ns)).toEqual([
      expect.objectContaining({ role: 'user', content: 'Persisted context' }),
    ]);
    expect(mockPrisma.agentMemoryEntry.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('CSRF double-submit protection', () => {
  function response() {
    return {
      cookie: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(),
    };
  }

  test('issues a browser-readable token and preserves an existing token', () => {
    const res = response(); const next = jest.fn();
    const fresh = { cookies: {} };
    csrf.issueCsrfCookie(fresh, res, next);
    expect(fresh.csrfToken).toEqual(expect.any(String));
    expect(res.cookie).toHaveBeenCalledWith(csrf.COOKIE_NAME, fresh.csrfToken, expect.objectContaining({
      httpOnly: false, sameSite: 'lax', path: '/',
    }));
    const existing = { cookies: { [csrf.COOKIE_NAME]: 'existing-token' } };
    csrf.issueCsrfCookie(existing, res, next);
    expect(existing.csrfToken).toBe('existing-token');
  });

  test('allows safe and non-cookie authentication methods', () => {
    for (const req of [
      { method: 'GET', headers: {}, cookies: {} },
      { method: 'POST', headers: { authorization: 'Bearer token' }, cookies: {} },
      { method: 'DELETE', headers: { authorization: 'ApiKey key' }, cookies: {} },
    ]) {
      const next = jest.fn();
      csrf.csrfProtect(req, response(), next);
      expect(next).toHaveBeenCalled();
    }
  });

  test('rejects missing and mismatched tokens and accepts an exact match', () => {
    const missing = response();
    csrf.csrfProtect({ method: 'POST', headers: {}, cookies: {} }, missing, jest.fn());
    expect(missing.status).toHaveBeenCalledWith(403);
    expect(missing.json).toHaveBeenCalledWith({ error: 'CSRF token missing' });

    const mismatch = response();
    csrf.csrfProtect({
      method: 'POST', headers: { [csrf.HEADER_NAME]: 'different' }, cookies: { [csrf.COOKIE_NAME]: 'cookie' },
    }, mismatch, jest.fn());
    expect(mismatch.json).toHaveBeenCalledWith({ error: 'CSRF token mismatch' });

    const next = jest.fn();
    csrf.csrfProtect({
      method: 'POST', headers: { [csrf.HEADER_NAME]: 'same-token' }, cookies: { [csrf.COOKIE_NAME]: 'same-token' },
    }, response(), next);
    expect(next).toHaveBeenCalled();
  });
});

