'use strict';
/**
 * Agent Gateway: public discovery plus authenticated, allowlisted execution.
 * Consequential capabilities require a short-lived confirmation token minted
 * from a browser cookie session. Bearer/API-key agents cannot self-confirm.
 */
const crypto = require('crypto');
const express = require('express');
const { authMiddleware, requireScope } = require('../middleware/auth');
const attachTenant = require('../middleware/tenant');
const { asyncHandler } = require('../lib/validate');
const { audit, canonical } = require('../lib/audit');
const limiters = require('../lib/ratelimit');
const registry = require('../lib/tool-registry');
const toolData = require('../lib/tool-data');
const config = require('../lib/agent-gateway-config');
const modelRouter = require('../lib/model-router');
const modelGateway = require('../lib/agent-model-gateway');
const guard = require('../lib/ai-guardrails');
const prisma = require('../lib/prisma');


const discovery = express.Router();
const api = express.Router();
const SEARCH_CAPABILITY = config.capabilities.find((c) => !c.tool);

function manifest(req) {
  const origin = `${req.protocol}://${req.get('host')}`;
  const registryOrigin = String(process.env.KUBILD_AGENT_REGISTRY_URL || '').replace(/\/$/, '');
  return {
    manifest_version: config.manifestVersion,
    name: config.name,
    description: config.description,
    capabilities: config.capabilities.map((c) => ({
      id: c.id,
      description: c.description,
      requires_confirmation: c.requires_confirmation,
      access: c.access,
      input_schema: c.input_schema,
      output_schema: c.output_schema,
      endpoint: c.endpoint ? new URL(c.endpoint, origin).toString() : `${origin}/api/agent-gateway/execute`,
      method: c.method || 'POST',
      ...(c.content_type ? { content_type: c.content_type } : {}),
      ...(c.authentication ? { authentication: c.authentication } : {}),
      ...(c.roles ? { roles: c.roles } : {}),
      ...(c.scopes ? { scopes: c.scopes } : {}),
    })),
    authentication: 'api_key',
    data_freshness: new Date().toISOString(),
    operator: config.operator,
    policies: { rate_limit_per_minute: config.rateLimitPerMinute, terms_url: config.termsUrl || null },
    endpoints: { base: `${origin}/api/agent-gateway`, mcp: `${origin}/api/mcp`, ...(registryOrigin ? { registry: `${registryOrigin}/.well-known/agent-registry.json` } : {}) },
  };
}

discovery.get('/agent-manifest.json', (req, res) => {
  if (!config.publicDiscovery) return res.status(404).json({ error: 'not_found' });
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  if (process.env.KUBILD_AGENT_REGISTRY_URL) res.set('X-Agent-Registry', String(process.env.KUBILD_AGENT_REGISTRY_URL).replace(/\/$/, ''));
  res.json(manifest(req));
});

api.use(authMiddleware);
api.use(attachTenant);
api.use(limiters.makeLimiter({ windowMs: 60_000, max: config.rateLimitPerMinute, name: 'agent-gateway' }));

api.get('/capabilities', requireScope('read', 'agent:read'), (req, res) => {
  res.json({ capabilities: config.capabilities });
});

api.get('/models', requireScope('read', 'agent:read'), (_req, res) => {
  if (!config.modelRouting) return res.status(404).json({ error: 'not_found' });
  const configured = new Set(modelGateway.configuredProviders());
  res.json({ strategy: modelRouter.strategy(), models: modelRouter.listModels().filter((m) => configured.has(m.provider)) });
});

api.post('/complete', requireScope('agent:execute', 'write'), asyncHandler(async (req, res) => {
  if (!config.modelRouting) return res.status(404).json({ error: 'not_found' });
  const prompt = String((req.body && req.body.prompt) || '');
  const system = String((req.body && req.body.system) || '');
  if (!prompt || prompt.length > 50000 || system.length > 20000) return res.status(400).json({ error: 'invalid_prompt', code: 'invalid_prompt' });
  const result = await modelGateway.complete({
    prompt, system, model: req.body.model,
    difficulty: req.body.difficulty || modelRouter.classifyDifficulty(prompt),
    planId: req.tenant?.planId || 'free', budgetUtilization: Number(req.body.budget_utilization) || 0,
  });
  const ucents = modelRouter.estimateCostUcents(result.modelId, result.promptTokens, result.completionTokens);
  await guard.recordAiUsage(prisma, { userId: req.user.id, orgId: req.user.orgId }, {
    provider: result.provider, model: result.modelId, promptTokens: result.promptTokens,
    completionTokens: result.completionTokens, costUsd: ucents / 100000, prompt, outcome: 'success',
  });
  await audit(req, 'agent_gateway.complete', { details: { provider: result.provider, model: result.modelId, ucents, router_reason: result.reason } });
  res.json({ output: result.text, provider: result.provider, model: result.modelId, router_reason: result.reason,
    usage: { prompt_tokens: result.promptTokens, completion_tokens: result.completionTokens, ucents } });
}));

function capability(id) {
  return config.capabilities.find((c) => c.id === id) || null;
}

function hasAnyScope(req, scopes) {
  const held = req.authScopes || [];
  return held.includes('*') || scopes.some((scope) => held.includes(scope));
}

function confirmationSecret() {
  return process.env.AGENT_CONFIRMATION_SECRET || process.env.JWT_SECRET;
}

function argsDigest(args) {
  return crypto.createHash('sha256').update(canonical(args || {})).digest('hex');
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', confirmationSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token, expected) {
  const [body, supplied] = String(token || '').split('.');
  if (!body || !supplied) return false;
  const actual = crypto.createHmac('sha256', confirmationSecret()).update(body).digest('base64url');
  const a = Buffer.from(actual); const b = Buffer.from(supplied);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return false; }
  return payload.exp > Date.now() && payload.userId === expected.userId &&
    payload.orgId === expected.orgId && payload.capability === expected.capability &&
    payload.argsDigest === expected.argsDigest;
}

// Deliberately cookie-only: a machine credential capable of execution must not
// also be able to manufacture its own evidence of human confirmation.
api.post('/authorizations', asyncHandler(async (req, res) => {
  if (req.authMode !== 'cookie') return res.status(403).json({ error: 'browser_confirmation_required', code: 'browser_confirmation_required' });
  const cap = capability(req.body && req.body.capability);
  if (!cap || !cap.requires_confirmation) return res.status(400).json({ error: 'confirmation_not_applicable', code: 'confirmation_not_applicable' });
  const payload = {
    userId: req.user.id, orgId: req.user.orgId || null, capability: cap.id,
    argsDigest: argsDigest(req.body.arguments), exp: Date.now() + 5 * 60_000,
    nonce: crypto.randomUUID(),
  };
  await audit(req, 'agent_gateway.confirm', { details: { capability: cap.id } });
  res.json({ confirmation_token: sign(payload), expires_in: 300 });
}));

api.post('/execute', asyncHandler(async (req, res) => {
  const started = Date.now();
  const cap = capability(req.body && req.body.capability);
  if (!cap) return res.status(404).json({ error: 'capability_not_found', code: 'capability_not_found' });
  const needed = cap.access === 'read' ? ['agent:execute', 'agent:read', 'read'] : ['agent:execute', 'write'];
  if (!hasAnyScope(req, needed)) return res.status(403).json({ error: 'scope_required', code: 'scope_required', required: needed });
  const args = (req.body && req.body.arguments) || {};
  if (cap.requires_confirmation && !verify(req.body.confirmation_token, {
    userId: req.user.id, orgId: req.user.orgId || null, capability: cap.id, argsDigest: argsDigest(args),
  })) {
    await audit(req, 'agent_gateway.execute', { outcome: 'blocked', details: { capability: cap.id, reason: 'confirmation_required' } });
    return res.status(409).json({ error: 'confirmation_required', code: 'confirmation_required' });
  }

  const ctx = { userId: req.user.id, orgId: req.user.orgId };
  ctx.data = toolData.forContext(ctx);
  let result;
  if (!cap.tool && SEARCH_CAPABILITY && cap.id === SEARCH_CAPABILITY.id) {
    const take = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
    const rows = await ctx.data.list('Verification', { take });
    const query = String(args.query || '').toLowerCase();
    result = { results: query ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query)).slice(0, take) : rows };
  } else {
    const tool = registry.getTool(cap.tool);
    if (!tool) return res.status(503).json({ error: 'capability_unavailable', code: 'capability_unavailable' });
    
    result = await tool.run(args, ctx);
  }
  await audit(req, 'agent_gateway.execute', { details: { capability: cap.id, duration_ms: Date.now() - started } });
  res.json({ ok: true, capability: cap.id, result, meta: { duration_ms: Date.now() - started, request_id: req.requestId } });
}));

module.exports = { discovery, api };

