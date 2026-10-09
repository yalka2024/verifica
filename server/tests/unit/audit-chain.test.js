'use strict';

jest.mock('../../lib/prisma', () => ({
  activity: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
}));

const prisma = require('../../lib/prisma');
const { canonical, computeHash, verifyChain, GENESIS } = require('../../lib/audit');

function row(id, prevHash, payload, createdAt) {
  return { id, prevHash, hash: computeHash(prevHash, payload), createdAt, ...payload };
}

describe('tamper-evident audit chain', () => {
  test('uses a keyed, versioned HMAC and fails closed when its key version is unavailable', () => {
    const prior = process.env.AUDIT_HMAC_KEY;
    process.env.AUDIT_HMAC_KEY = 'audit-test-key-that-is-at-least-32-characters';
    const payload = { action: 'keyed' };
    const hash = computeHash(GENESIS, payload);
    expect(hash).toMatch(/^h1:[0-9a-f]{12}:[0-9a-f]{64}$/);
    process.env.AUDIT_HMAC_KEY = 'different-audit-key-that-is-at-least-32-characters';
    expect(() => computeHash(GENESIS, payload, hash)).toThrow(/unavailable/);
    if (prior === undefined) delete process.env.AUDIT_HMAC_KEY;
    else process.env.AUDIT_HMAC_KEY = prior;
  });

  test('canonicalization is stable across object key order', () => {
    expect(canonical({ b: 2, a: { d: 4, c: 3 } })).toBe(canonical({ a: { c: 3, d: 4 }, b: 2 }));
  });

  test('verifies an intact chain and detects a modified payload', async () => {
    const at1 = new Date('2026-01-01T00:00:00.000Z');
    const at2 = new Date('2026-01-01T00:00:01.000Z');
    const p1 = { action: 'created', details: null };
    const r1 = row('a1', GENESIS, p1, at1);
    const p2 = { action: 'approved', details: '{"ok":true}' };
    const r2 = row('a2', r1.hash, p2, at2);

    prisma.activity.findMany.mockResolvedValueOnce([r1, r2]);
    await expect(verifyChain()).resolves.toMatchObject({ ok: true, total: 2, broken: false });

    prisma.activity.findMany.mockReset();
    prisma.activity.findMany.mockResolvedValueOnce([r1, { ...r2, action: 'tampered' }]);
    await expect(verifyChain()).resolves.toMatchObject({ ok: false, firstBrokenId: 'a2', broken: true });
  });

  test('a null-hash row after the chain starts is a break', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const first = row('a1', GENESIS, { action: 'created' }, createdAt);
    prisma.activity.findMany.mockResolvedValueOnce([
      first,
      { id: 'a2', hash: null, prevHash: null, action: 'legacy', createdAt },
    ]);
    await expect(verifyChain()).resolves.toMatchObject({ ok: false, firstBrokenId: 'a2' });
  });
});

