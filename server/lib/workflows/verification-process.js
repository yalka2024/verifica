/**
 * Workflow: Verification Process
 * 
 *
 * Generated for Verifica. The workflow runtime (lib/workflow-runtime.js)
 * executes `steps` in order, resolving each step against the agent/tool
 * registries. `agent` optionally pins a default agent for unbound steps.
 */
module.exports = {
  name: "Verification Process",
  description: "",
  steps: ["User submits data", "Redact PII", "Process through AI models", "Run deterministic checks", "Provide evidence-backed verdict"],
  agent: null,
};

