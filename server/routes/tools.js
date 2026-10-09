/**
 * Tools API for Verifica — list and invoke the platform's real tools.
 *
 * Built-in tools (forecast, scorer, …) compute for real; integration adapters
 * return labeled mock data until configured, and refuse live mode on a
 * safety-gated platform. Auth-protected.
 */
const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../lib/validate');
const registry = require('../lib/tool-registry');
const toolData = require('../lib/tool-data');



const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  res.json(registry.listTools().map((t) => ({
    name: t.name,
    description: t.description || '',
    inputs: t.inputs || [],
    outputs: t.outputs || [],
    status: typeof t.status === 'function' ? t.status() : 'builtin',
  })));
});

router.post('/:name/run', asyncHandler(async (req, res) => {
  const tool = registry.getTool(req.params.name);
  if (!tool) return res.status(404).json({ error: 'tool_not_found' });

  // E5 — ctx.data gives tools tenant-scoped access to the platform's own
  // domain tables (list/get/count/create/setComputed). Without it the
  // intelligence layer could not see the records generic CRUD writes.
  const ctx = { userId: req.user && req.user.id, orgId: req.user && req.user.orgId };
  ctx.data = toolData.forContext(ctx);

  const result = await tool.run(req.body || {}, ctx);  // safety/mock semantics enforced inside the tool

  res.json({ ok: true, tool: tool.name, result });
}));

module.exports = router;

