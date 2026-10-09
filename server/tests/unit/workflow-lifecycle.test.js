'use strict';

const mockRuns = new Map();
jest.mock('../../lib/run-store', () => ({
  save: jest.fn(async run => { mockRuns.set(run.id, structuredClone(run)); return run; }),
  get: jest.fn(async id => mockRuns.get(id) ? structuredClone(mockRuns.get(id)) : null),
  list: jest.fn(async () => Array.from(mockRuns.values())),
}));
jest.mock('../../lib/agent-registry', () => ({ listAgents: () => [], getAgent: () => null }));
jest.mock('../../lib/tool-registry', () => ({ listTools: () => [] }));
jest.mock('../../lib/tool-data', () => ({ forContext: () => ({}) }));
jest.mock('../../lib/agent-runtime', () => ({ runAgent: jest.fn() }));

const { runAgent } = require('../../lib/agent-runtime');
const { runWorkflow } = require('../../lib/workflow-runtime');

describe('durable workflow retry, resume, and cancellation', () => {
  const workflow = { name: 'Lifecycle test workflow', description: 'test', steps: ['one', 'two', 'three'] };

  beforeEach(() => { mockRuns.clear(); runAgent.mockReset(); });

  test('checkpoints completed steps and resumes without replaying them', async () => {
    runAgent
      .mockResolvedValueOnce({ output: 'step-one' })
      .mockRejectedValueOnce(new Error('transient failure'));
    const first = await runWorkflow(workflow, 'input', { orgId: 'org-1' }, 'run-1');
    expect(first.status).toBe('failed');
    expect(first.steps[0]).toMatchObject({ index: 0, status: 'completed', output: 'step-one' });

    runAgent
      .mockResolvedValueOnce({ output: 'step-two' })
      .mockResolvedValueOnce({ output: 'step-three' });
    const resumed = await runWorkflow(workflow, 'input', { orgId: 'org-1' }, 'run-1');
    expect(resumed.status).toBe('completed');
    expect(resumed.steps.map(step => step.output)).toEqual(['step-one', 'step-two', 'step-three']);
    expect(runAgent).toHaveBeenCalledTimes(4); // two initial attempts + two resumed steps
  });

  test('persists cancellation before starting the next step', async () => {
    let checks = 0;
    runAgent.mockResolvedValue({ output: 'step-one' });
    const cancelled = await runWorkflow(workflow, 'input', {
      orgId: 'org-1', isCancelled: async () => ++checks > 1,
    }, 'run-2');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.steps).toHaveLength(1);
    expect(mockRuns.get('run-2').status).toBe('cancelled');
  });
});

