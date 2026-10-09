'use strict';

// Generated allowlist. Capabilities absent from this declaration can never be
// discovered or executed through the Agent Gateway.
const config = {"manifestVersion":"0.1","name":"Verifica","description":"A bilingual web app that verifies the authenticity of individuals offering immigration help before users pay or share documents.","publicDiscovery":true,"modelRouting":false,"operator":{"name":"Verifica","contact":"","verified":false},"termsUrl":"","rateLimitPerMinute":60,"capabilities":[{"id":"search_verifications","description":"Read-only search over verifications.","tool":null,"access":"read","requires_confirmation":false,"input_schema":{"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":50}}},"output_schema":{"type":"object","properties":{"results":{"type":"array"}}}}]};
config.operator = Object.freeze(config.operator);
config.capabilities = Object.freeze(config.capabilities.map(Object.freeze));
module.exports = Object.freeze(config);

