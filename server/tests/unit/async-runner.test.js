'use strict';

const mockStore = {
  save: jest.fn(async run => run),
  get: jest.fn(),
  isCancellationRequested: jest.fn(async () => false),
  clearCancel: jest.fn(),
};
const mockGetAgent = jest.fn();
const mockGetWorkflow = jest.fn();
const mockRunAgent = jest.fn();
const mockRunWorkflow = jest.fn();
const mockSubmitGoal = jest.fn();

jest.mock('../../lib/run-store', () => mockStore);
jest.mock('../../lib/agent-registry', () => ({ getAgent: mockGetAgent }));
jest.mock('../../lib/workflow-registry', () => ({ getWorkflow: mockGetWorkflow }));
jest.mock('../../lib/agent-runtime', () => ({ runAgent: mockRunAgent }));
jest.mock('../../lib/workflow-runtime', () => ({ runWorkflow: mockRunWorkflow }));
// The orchestrator is emitted only for the agent-orchestrator archetype.
jest.mock('../../lib/orchestrator', () => ({ submitGoal: mockSubmitGoal }), { virtual: true });

const runner = require('../../lib/async-runner');

function flushBackgroundRun() {
  return new Promise(resolve => setImmediate(() => setImmediate(resolve)));
}

describe('background async runner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.save.mockImplementation(async run => run);
    mockStore.isCancellationRequested.mockResolvedValue(false);
  });

  afterAll(() => runner.stopWorker());

  test.each([
    [{ output: 'done', steps: [1] }, 'completed'],
    [{ output: 'partial', steps: [1], truncated: true }, 'truncated'],
    [{ output: 'stopped', steps: [], cancelled: true }, 'cancelled'],
  ])('enqueues and completes an agent with the terminal runtime status', async (result, status) => {
    const agent = { name: 'researcher' };
    mockGetAgent.mockReturnValue(agent);
    mockRunAgent.mockResolvedValue(result);

    const runId = await runner.enqueue('agent', 'researcher', { question: 'why' }, {
      orgId: 'org-1', userId: 'user-1', modelId: 'model-1',
    });
    expect(runId).toEqual(expect.any(String));
    expect(mockStore.save).toHaveBeenCalledWith(expect.objectContaining({
      id: runId, kind: 'agent', name: 'researcher', status: 'queued',
      input: JSON.stringify({ question: 'why' }),
    }));

    await flushBackgroundRun();
    expect(mockRunAgent).toHaveBeenCalledWith(agent, { question: 'why' }, expect.objectContaining({
      runId, orgId: 'org-1', userId: 'user-1', isCancelled: expect.any(Function),
    }));
    expect(mockStore.save).toHaveBeenLastCalledWith(expect.objectContaining({
      id: runId, status, output: result.output, steps: result.steps,
    }));
    expect(mockStore.clearCancel).toHaveBeenCalledWith(runId);
  });

  test('persists unknown agents and runtime exceptions as failed runs', async () => {
    mockGetAgent.mockReturnValueOnce(undefined).mockReturnValue({ name: 'broken' });
    mockRunAgent.mockRejectedValue(new Error('provider unavailable'));

    const unknownId = await runner.enqueue('agent', 'missing', 'input');
    await flushBackgroundRun();
    expect(mockStore.save).toHaveBeenLastCalledWith(expect.objectContaining({
      id: unknownId, status: 'failed', error: 'unknown agent: missing',
    }));

    const brokenId = await runner.enqueue('agent', 'broken', 'input');
    await flushBackgroundRun();
    expect(mockStore.save).toHaveBeenLastCalledWith(expect.objectContaining({
      id: brokenId, status: 'failed', error: 'provider unavailable',
    }));
  });

  test('dispatches workflows with the durable run id and cooperative cancellation context', async () => {
    const workflow = { name: 'approval', steps: [] };
    mockGetWorkflow.mockReturnValue(workflow);
    mockRunWorkflow.mockResolvedValue({ status: 'completed' });

    const runId = await runner.enqueue('workflow', 'approval', 'request', { orgId: 'org-2' });
    await flushBackgroundRun();

    expect(mockRunWorkflow).toHaveBeenCalledWith(
      workflow, 'request', expect.objectContaining({ runId, isCancelled: expect.any(Function) }), runId,
    );
    const cancellationCheck = mockRunWorkflow.mock.calls[0][2].isCancelled;
    await expect(cancellationCheck()).resolves.toBe(false);
    expect(mockStore.isCancellationRequested).toHaveBeenCalledWith(runId);
  });

  test('fails unknown workflows and unknown job kinds durably', async () => {
    mockGetWorkflow.mockReturnValue(undefined);
    const workflowId = await runner.enqueue('workflow', 'missing', 'request');
    await flushBackgroundRun();
    expect(mockStore.save).toHaveBeenLastCalledWith(expect.objectContaining({
      id: workflowId, status: 'failed', error: 'unknown workflow: missing',
    }));

    const invalidId = await runner.enqueue('invalid', 'bad', 'request');
    await flushBackgroundRun();
    expect(mockStore.save).toHaveBeenLastCalledWith(expect.objectContaining({
      id: invalidId, status: 'failed', error: 'unknown kind: invalid',
    }));
  });

  test('submits goals through the orchestrator using the assigned run id', async () => {
    mockSubmitGoal.mockResolvedValue({ status: 'queued' });
    const runId = await runner.enqueue('goal', 'improve retention', { objective: 'improve retention' }, {
      orgId: 'org-3', userId: 'user-3',
    });
    await flushBackgroundRun();
    expect(mockSubmitGoal).toHaveBeenCalledWith(
      { objective: 'improve retention' },
      expect.objectContaining({ runId, orgId: 'org-3', userId: 'user-3' }),
      { runId },
    );
  });

  test('validates retry eligibility and requeues a failed run with its identity intact', async () => {
    mockStore.get.mockResolvedValueOnce(null);
    await expect(runner.retry('missing')).rejects.toThrow('run_not_found');

    mockStore.get.mockResolvedValueOnce({ id: 'active', status: 'running' });
    await expect(runner.retry('active')).rejects.toThrow('run_not_retryable');

    mockStore.get.mockResolvedValueOnce({
      id: 'retry-1', kind: 'workflow', name: 'approval', input: 'request',
      orgId: 'org-4', userId: 'user-4', status: 'failed', error: 'temporary',
    });
    mockGetWorkflow.mockReturnValue({ name: 'approval', steps: [] });
    mockRunWorkflow.mockResolvedValue({ status: 'completed' });

    await expect(runner.retry('retry-1')).resolves.toBe('retry-1');
    expect(mockStore.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'retry-1', status: 'queued', error: null,
    }));
    await flushBackgroundRun();
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.any(Object), 'request', expect.objectContaining({ orgId: 'org-4', userId: 'user-4' }), 'retry-1',
    );
  });

  test('does not start an external worker when Redis is not configured', async () => {
    expect(runner.startWorker()).toBeNull();
    await expect(runner.stopWorker()).resolves.toBeUndefined();
    expect(runner.getRun).toBe(mockStore.get);
  });
});

