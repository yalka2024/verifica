'use strict';

const mockPrisma = {
  agentRun: {
    upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(),
  },
};
jest.mock('../../lib/prisma', () => mockPrisma);

const store = require('../../lib/run-store');

describe('durable run store', () => {
  beforeEach(() => jest.clearAllMocks());

  test('serializes and upserts a complete run snapshot', async () => {
    mockPrisma.agentRun.upsert.mockResolvedValue({});
    const run = {
      id: 'save-1', kind: 'workflow', name: 'test', orgId: 'org-1', userId: 'user-1',
      status: 'running', input: { value: 1 }, steps: [{ index: 0 }], output: 'partial',
    };
    await store.save(run);
    expect(mockPrisma.agentRun.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'save-1' },
      create: expect.objectContaining({
        id: 'save-1', kind: 'workflow', orgId: 'org-1', status: 'running',
        steps: expect.stringContaining('"index":0'),
      }),
    }));
    expect(await store.get('save-1')).toEqual(run);
  });

  test('inflates a persisted snapshot and caches it', async () => {
    const snapshot = { id: 'db-1', kind: 'agent', name: 'persisted', status: 'completed', steps: [] };
    mockPrisma.agentRun.findUnique.mockResolvedValue({
      ...snapshot, orgId: null, userId: null, input: null, output: null,
      steps: JSON.stringify(snapshot), error: null,
    });
    expect(await store.get('db-1')).toEqual(snapshot);
    expect(await store.get('db-1')).toEqual(snapshot);
    expect(mockPrisma.agentRun.findUnique).toHaveBeenCalledTimes(1);
  });

  test('falls back to denormalized columns when a legacy snapshot is invalid', async () => {
    mockPrisma.agentRun.findUnique.mockResolvedValue({
      id: 'legacy-1', orgId: 'org-1', userId: 'user-1', kind: 'workflow', name: 'legacy',
      status: 'failed', input: 'input', output: null, steps: '{invalid', error: 'failed',
      createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
    });
    expect(await store.get('legacy-1')).toMatchObject({
      id: 'legacy-1', status: 'failed', steps: [], error: 'failed',
    });
  });

  test('lists scoped runs and uses cache if the database is unavailable', async () => {
    const snapshot = { id: 'list-1', kind: 'workflow', name: 'listed', status: 'completed', steps: [] };
    mockPrisma.agentRun.findMany.mockResolvedValue([{ ...snapshot, steps: JSON.stringify(snapshot) }]);
    expect(await store.list({ kind: 'workflow', orgId: 'org-1', take: 7 })).toEqual([snapshot]);
    expect(mockPrisma.agentRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { kind: 'workflow', orgId: 'org-1' }, take: 7,
    }));

    await store.save({ id: 'cached-fallback', kind: 'workflow', name: 'cached', orgId: 'org-1', status: 'running' });
    mockPrisma.agentRun.findMany.mockRejectedValue(new Error('offline'));
    expect(await store.list({ kind: 'workflow', orgId: 'org-1' }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'cached-fallback' })]));
  });

  test('persists cancellation and observes requests made by another process', async () => {
    mockPrisma.agentRun.upsert.mockResolvedValue({});
    await store.save({ id: 'cancel-local', kind: 'workflow', name: 'cancel', status: 'running' });
    expect(await store.requestCancel('cancel-local')).toBe(true);
    expect(await store.get('cancel-local')).toMatchObject({ status: 'cancelling' });
    expect(store.isCancelled('cancel-local')).toBe(true);
    expect(await store.isCancellationRequested('cancel-local')).toBe(true);
    store.clearCancel('cancel-local');
    expect(store.isCancelled('cancel-local')).toBe(false);

    mockPrisma.agentRun.findUnique.mockResolvedValue({ status: 'cancelling' });
    expect(await store.isCancellationRequested('cancel-remote')).toBe(true);
    mockPrisma.agentRun.findUnique.mockResolvedValue({ status: 'running' });
    expect(await store.isCancellationRequested('not-cancelled')).toBe(false);
    mockPrisma.agentRun.findUnique.mockRejectedValue(new Error('offline'));
    expect(await store.isCancellationRequested('unknown')).toBe(false);
  });
});

