/**
 * Spec-driven domain CRUD for Verifica (Phase 2).
 *
 * Generated from the spec's `entities`. Each entity gets tenant-scoped,
 * auth-protected CRUD over its real Prisma model. When the spec declares no
 * entities, ENTITIES is [] and this router is a harmless no-op.
 *
 * Routes (per entity, e.g. `products`):
 *   GET    /api/products          list (scoped to the caller's tenant)
 *   GET    /api/products/:id      fetch one
 *   POST   /api/products          create
 *   PUT    /api/products/:id      update
 *   DELETE /api/products/:id      delete
 *
 * Three spec-driven policies are enforced here (see the helpers below):
 *   E1 `computed` / `writable_by` — maker-checker: agent-computed fields and
 *      approval flags can't be set by whoever they judge, except a role the
 *      spec names may later override a computed field (e.g. a dispatcher
 *      manually reassigning a job an agent auto-assigned).
 *   E2 `anonymous` — submitter identity is never written or returned; see
 *      routes/public-intake.js for the unauthenticated submission path.
 *   E3 `row_scope` — a role can be restricted to rows it owns (its own
 *      assigned jobs, its own rental agreements), not just its own tenant.
 */
const express = require('express');
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const attachTenant = require('../middleware/tenant');
const { requireWrite } = require('../lib/roles');
const { enforceMeter, blockIfSuspended } = require('../middleware/entitlements');
const { asyncHandler } = require('../lib/validate');

const router = express.Router();
router.use(authMiddleware);
// E8 — attachTenant runs the request inside the tenant context, which is what
// sets the Postgres `app.org_id` GUC that prisma/rls.sql's policy reads. Without
// it the policy's "unset => unrestricted" branch applied to every spec-driven
// table, so the documented "even a route that forgets its filter cannot leak
// another tenant's rows" backstop was not true for exactly the tables that hold
// customer domain data (external audit finding). It also applies the per-tenant
// rate budget.
router.use(attachTenant);
// E6 — the plans catalog, usage counters and dunning logic all existed, but no
// route consulted them: paid and free customers behaved identically. A
// suspended (dunning-failed) org is now blocked here, and record creation is
// metered against the plan's records_per_month limit below.
router.use(blockIfSuspended());

// Policy + manifest live in lib/entity-policy.js: dependency-free, so
// tests/unit/policy-guarantees.test.js can prove these guarantees without a
// database — and proves the REAL predicates, not a copy of them.
const { ENTITIES, scope, pick, fieldPolicyViolations, canReadAnonymous, readSelect, rowScopeViolation } = require('../lib/entity-policy');

for (const e of ENTITIES) {
  const model = e.model;
  const base = '/' + e.plural;

  router.get(base, asyncHandler(async (req, res) => {
    if (!canReadAnonymous(req, e)) return res.status(403).json({ error: 'forbidden', code: 'anonymous_read_restricted' });
    const rows = await prisma[model].findMany({
      where: scope(req, null, e),
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: readSelect(e),
    });
    res.json(rows);
  }));

  router.get(base + '/:id', asyncHandler(async (req, res) => {
    if (!canReadAnonymous(req, e)) return res.status(403).json({ error: 'forbidden', code: 'anonymous_read_restricted' });
    const row = await prisma[model].findFirst({ where: scope(req, { id: req.params.id }, e), select: readSelect(e) });
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json(row);
  }));

  // E1 — PUT may also touch fields that are `computed` but role-overridable
  // (present in writableBy though excluded from `e.fields`, the create list).
  // fieldPolicyViolations still gates every one of them per-role below.
  const updatableFields = e.fields.concat(Object.keys(e.writableBy || {}).filter((f) => !e.fields.includes(f)));

  router.post(base, requireWrite, enforceMeter('records_per_month'), asyncHandler(async (req, res) => {
    const data = pick(req.body, e.fields);
    const denied = fieldPolicyViolations(req, e, data);
    if (denied.length) return res.status(403).json({ error: 'forbidden', code: 'field_policy', fields: denied });
    if (rowScopeViolation(req, e, data)) return res.status(403).json({ error: 'forbidden', code: 'row_scope_violation' });
    data.orgId = (req.user && req.user.orgId) || null;
    // E2 — an anonymous entity NEVER records who created the row, on any path.
    if (!e.anonymous) data.userId = req.user && req.user.id;
    // E3 — a caller creating their own row in a row-scoped entity (e.g. a
    // technician filing their own InspectionRecord) doesn't need to pass
    // their own id explicitly; it's implied by who they are. An explicit
    // value in the body is still honored ONLY when it's their own id, or
    // they're admin (rowScopeViolation above already rejected anything
    // else), so this only fills the gap rather than overriding intent.
    const rsField = e.rowScope && req.user && e.rowScope[req.user.role];
    if (rsField && data[rsField] === undefined) data[rsField] = req.user.id;
    const row = await prisma[model].create({ data, select: readSelect(e) });
    res.status(201).json(row);
  }));

  router.put(base + '/:id', requireWrite, asyncHandler(async (req, res) => {
    const data = pick(req.body, updatableFields);
    const denied = fieldPolicyViolations(req, e, data);
    if (denied.length) return res.status(403).json({ error: 'forbidden', code: 'field_policy', fields: denied });
    if (rowScopeViolation(req, e, data)) return res.status(403).json({ error: 'forbidden', code: 'row_scope_violation' });
    const result = await prisma[model].updateMany({
      where: scope(req, { id: req.params.id }, e),
      data,
    });
    if (!result.count) return res.status(404).json({ error: 'not_found' });
    res.json(await prisma[model].findUnique({ where: { id: req.params.id }, select: readSelect(e) }));
  }));

  router.delete(base + '/:id', requireWrite, asyncHandler(async (req, res) => {
    const result = await prisma[model].deleteMany({ where: scope(req, { id: req.params.id }, e) });
    if (!result.count) return res.status(404).json({ error: 'not_found' });
    res.status(204).end();
  }));
}

module.exports = router;

