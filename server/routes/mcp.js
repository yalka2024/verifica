/**
 * MCP server for Verifica — a REAL /api/mcp endpoint (inventory gap
 * #14: the manifest declared this route but nothing implemented it).
 *
 * Dependency-free JSON-RPC 2.0 over HTTP POST implementing the MCP core an
 * agent client needs: initialize, ping, tools/list, tools/call. Tools are the
 * platform's OWN tool registry (the same real/pack/filled tools the agents
 * use) plus a read-only search over the core entity. Every call is
 * authenticated (Bearer token or ApiKey — MCP clients send an Authorization
 * header; CSRF exempts non-cookie auth), tenant-scoped, rate-limited, and
 * audited.
 *
 * Transport scope (honest): single-request JSON-RPC over POST. No SSE
 * streaming or server-initiated messages; notifications are acknowledged with
 * 202 and no body, per JSON-RPC notification semantics.
 */
const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const limiters = require('../lib/ratelimit');
const { audit } = require('../lib/audit');
const registry = require('../lib/tool-registry');
const toolData = require('../lib/tool-data');
const prisma = require('../lib/prisma');


const router = express.Router();
router.use(authMiddleware);
router.use(limiters.ai);

const PROTOCOL_VERSION = '2025-03-26';
const SERVER_INFO = { name: 'verifica', version: '1.0.0' };
const SEARCH_TOOL = 'search_verifications';

function toolInputSchema(tool) {
  const props = {};
  for (const name of tool.inputs || []) props[name] = { type: 'string' };
  return { type: 'object', properties: props };
}

function listMcpTools() {
  const tools = registry.listTools().map((t) => ({
    name: t.name,
    description: t.description || '',
    inputSchema: toolInputSchema(t),
  }));
  tools.push({
    name: SEARCH_TOOL,
    description: 'Read-only search over your verifications (name match, most recent first).',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } } },
  });
  return tools;
}

async function callTool(name, args, ctx) {
  if (name === SEARCH_TOOL) {
    const take = Math.min(Math.max(Number(args && args.limit) || 20, 1), 50);
    const rows = await prisma.verification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    const q = String((args && args.query) || '').toLowerCase();
    const filtered = q ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : rows;
    return { results: filtered.slice(0, take) };
  }
  const tool = registry.getTool(name);
  if (!tool) {
    const err = new Error(`unknown tool: ${name}`);
    err.mcpCode = -32602;
    throw err;
  }
  
  return tool.run(args || {}, ctx); // safety/mock semantics enforced inside the tool
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } };
}

router.post('/', express.json({ limit: '1mb' }), async (req, res) => {
  const msg = req.body;
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return res.status(400).json(rpcError(msg && msg.id, -32600, 'invalid JSON-RPC 2.0 request'));
  }
  const { id, method, params } = msg;
  const isNotification = id === undefined;
  // E5 — ctx.data gives tools tenant-scoped access to the platform's own
  // domain tables (list/get/count/create/setComputed). Without it the
  // intelligence layer could not see the records generic CRUD writes.
  const ctx = { userId: req.user && req.user.id, orgId: req.user && req.user.orgId };
  ctx.data = toolData.forContext(ctx);

  try {
    if (method === 'notifications/initialized' || method.startsWith('notifications/')) {
      return res.status(202).end(); // notifications get no JSON-RPC response
    }
    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: 'Verifica: call tools/list, then tools/call. All calls are tenant-scoped to your account.',
        },
      });
    }
    if (method === 'ping') {
      return res.json({ jsonrpc: '2.0', id, result: {} });
    }
    if (method === 'tools/list') {
      return res.json({ jsonrpc: '2.0', id, result: { tools: listMcpTools() } });
    }
    if (method === 'tools/call') {
      const name = params && params.name;
      if (typeof name !== 'string' || !name) {
        return res.status(400).json(rpcError(id, -32602, 'params.name is required'));
      }
      const result = await callTool(name, (params && params.arguments) || {}, ctx);
      await audit(req, 'mcp.tool.call', { details: { tool: name } });
      const isError = Boolean(result && result._mock === undefined && result.error);
      return res.json({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }], isError },
      });
    }
    if (isNotification) return res.status(202).end();
    return res.status(404).json(rpcError(id, -32601, `method not found: ${method}`));
  } catch (e) {
    const code = e.mcpCode || -32603;
    return res.status(code === -32602 ? 400 : 500).json(rpcError(id, code, String(e.message || e).slice(0, 300)));
  }
});

module.exports = router;

