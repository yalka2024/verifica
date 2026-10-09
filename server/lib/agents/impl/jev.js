/**
 * Agent implementation: Jev
 * 
 *
 * Generated for Verifica. HONEST STUB — the C4.1 slot contract,
 * extended to agents the same way it already covers workflow steps: when
 * `realImplemented` is true, `run(input, ctx)` executes INSTEAD of the LLM
 * tool-calling loop for this agent (agent-runtime.js checks this before
 * falling through to the model). Left false (the default), the agent runs
 * through the normal loop unchanged, so partial implementation is always
 * safe — an agent whose behavior is genuinely a fixed composition of
 * existing tools (filter, rank, assign — no open-ended reasoning) can be
 * made deterministic and testable without a model call; one that needs real
 * judgment stays on the LLM loop.
 *
 * Flip `realImplemented` to true ONLY once `run()` is genuinely implemented.
 */
'use strict';

const realImplemented = false;

// async (input, ctx) => { output, ...anything else worth returning }
async function run(input, ctx) {
  throw new Error('not implemented');
}

module.exports = { realImplemented, run, agent: "Jev" };

