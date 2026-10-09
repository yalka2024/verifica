'use strict';

process.env.AI_PROVIDER = 'openai';
process.env.OPENAI_API_KEY = 'test-provider-key';
process.env.AGENT_MAX_STEPS = '2';
process.env.AGENT_CASCADE = '0';

const mockCreate = jest.fn();
const mockGetTool = jest.fn();
const mockListTools = jest.fn(() => []);
const mockAgentNames = jest.fn(() => []);
const mockGetAgent = jest.fn();
const mockRemember = jest.fn();
const mockRecall = jest.fn(() => []);

jest.mock('openai', () => jest.fn().mockImplementation(() => ({
  chat: { completions: { create: mockCreate } },
})));
jest.mock('../../lib/tool-registry', () => ({ getTool: mockGetTool, listTools: mockListTools }));
jest.mock('../../lib/agent-registry', () => ({ agentNames: mockAgentNames, getAgent: mockGetAgent }));
jest.mock('../../lib/agent-memory', () => ({ remember: mockRemember, recall: mockRecall }));
jest.mock('../../lib/observability/tracing', () => ({
  withSpan: jest.fn((_name, _attrs, work) => work()),
}));
jest.mock('../../lib/model-router', () => ({
  classifyDifficulty: jest.fn(() => 'medium'),
  pickModel: jest.fn(() => ({ modelId: 'test-model' })),
}), { virtual: true });

const runtime = require('../../lib/agent-runtime');
const agent = { name: 'researcher', role: 'research', description: 'Investigates', tools: [] };

function response({ text = '', calls = [], prompt = 2, completion = 1 } = {}) {
  return {
    choices: [{
      message: {
        content: text,
        tool_calls: calls.map((call, index) => ({
          id: `call-${index}`, type: 'function',
          function: { name: call.name, arguments: call.arguments ?? JSON.stringify(call.input || {}) },
        })),
      },
      finish_reason: calls.length ? 'tool_calls' : 'stop',
    }],
    usage: { prompt_tokens: prompt, completion_tokens: completion },
  };
}

describe('provider-neutral agent runtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListTools.mockReturnValue([]);
    mockAgentNames.mockReturnValue([]);
    mockRecall.mockReturnValue([]);
  });

  test('returns a final model response, usage, events, and session memory', async () => {
    mockCreate.mockResolvedValue(response({ text: 'A complete researched answer.' }));
    mockRecall.mockReturnValue([{ role: 'assistant', content: 'Earlier useful context' }]);
    const onEvent = jest.fn();

    const result = await runtime.runAgent(agent, { question: 'What changed?' }, {
      session: 'session-1', onEvent,
    });

    expect(result).toMatchObject({
      output: 'A complete researched answer.',
      usage: { promptTokens: 2, completionTokens: 1 },
      steps: [{ step: 0, type: 'final' }],
    });
    expect(mockRecall).toHaveBeenCalledWith('session-1', JSON.stringify({ question: 'What changed?' }), 5);
    expect(mockRemember).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'final' }));
  });

  test('executes a requested tool then synthesizes its observation', async () => {
    const run = jest.fn(async input => ({ echoed: input.query }));
    mockListTools.mockReturnValue([{ name: 'lookup', description: 'Lookup', inputs: ['query'], run }]);
    mockGetTool.mockReturnValue({ name: 'lookup', run });
    mockCreate
      .mockResolvedValueOnce(response({ calls: [{ name: 'lookup', input: { query: 'Ada' } }] }))
      .mockResolvedValueOnce(response({ text: 'Lookup complete.', prompt: 3, completion: 2 }));
    const onEvent = jest.fn();

    const result = await runtime.runAgent(agent, 'Find Ada', { orgId: 'org-1', onEvent });

    expect(run).toHaveBeenCalledWith({ query: 'Ada' }, expect.objectContaining({
      orgId: 'org-1', agentName: 'researcher', depth: 0,
    }));
    expect(result).toMatchObject({
      output: 'Lookup complete.',
      usage: { promptTokens: 5, completionTokens: 3 },
      toolCalls: [{ name: 'lookup', input: { query: 'Ada' } }],
    });
    expect(onEvent).toHaveBeenCalledWith({ type: 'tool', name: 'lookup' });
  });

  test('contains unknown tools, invalid arguments, and tool failures as observations', async () => {
    const failing = { name: 'failing', run: jest.fn(() => { throw new Error('tool unavailable'); }) };
    mockListTools.mockReturnValue([failing]);
    mockGetTool.mockImplementation(name => name === 'failing' ? failing : undefined);
    mockCreate
      .mockResolvedValueOnce(response({ calls: [
        { name: 'missing', arguments: '{not-json' },
        { name: 'failing', input: { value: 1 } },
      ] }))
      .mockResolvedValueOnce(response({ text: 'Handled tool errors.' }));

    const result = await runtime.runAgent(agent, 'Try tools');
    expect(result.output).toBe('Handled tool errors.');
    expect(result.toolCalls).toEqual([
      { name: 'missing', input: {} },
      { name: 'failing', input: { value: 1 } },
    ]);
  });

  test('cooperatively cancels before making a provider request', async () => {
    const onEvent = jest.fn();
    const result = await runtime.runAgent(agent, 'Stop', { isCancelled: () => true, onEvent });
    expect(result).toMatchObject({ output: '(cancelled)', cancelled: true });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledWith({ type: 'cancelled', step: 0 });
  });

  test('truncates deterministically at the configured step cap', async () => {
    const tool = { name: 'repeat', run: jest.fn(async () => ({ again: true })) };
    mockListTools.mockReturnValue([tool]);
    mockGetTool.mockReturnValue(tool);
    mockCreate.mockResolvedValue(response({ calls: [{ name: 'repeat', input: {} }] }));
    const result = await runtime.runAgent(agent, 'Keep going');
    expect(result).toMatchObject({
      output: '(agent reached max steps without a final answer)', truncated: true,
    });
    expect(result.steps).toHaveLength(2);
  });

  test('delegates to a specialist and returns only its summary', async () => {
    const specialist = { name: 'specialist', role: 'specialist', tools: [] };
    mockAgentNames.mockReturnValue(['researcher', 'specialist']);
    mockGetAgent.mockReturnValue(specialist);
    mockCreate
      .mockResolvedValueOnce(response({ calls: [{
        name: 'delegate_to_agent', input: { agent: 'specialist', task: 'Focused task' },
      }] }))
      .mockResolvedValueOnce(response({ text: 'Specialist summary.' }))
      .mockResolvedValueOnce(response({ text: 'Parent answer.' }));

    const result = await runtime.runAgent(agent, 'Delegate this');
    expect(result.output).toBe('Parent answer.');
    expect(result.delegations).toEqual([{ agent: 'specialist', depth: 1 }]);
  });

  test('reports provider configuration for the selected provider', () => {
    expect(runtime.providerConfigured()).toBe(true);
    expect(runtime.MAX_STEPS).toBe(2);
    expect(runtime.MAX_DEPTH).toBeGreaterThan(0);
  });
});

