/**
 * Entity access policy for Verifica — the single source of truth for
 * WHO may read and write WHAT, extracted so it can be tested without a database.
 *
 * routes/entities.js enforces these; tests/unit/policy-guarantees.test.js proves
 * them. Both import this module, so the tests exercise the real production
 * predicates rather than a copy of them — a guarantee that is only asserted in
 * marketing is not a guarantee.
 *
 * Deliberately dependency-free: no express, no prisma, no I/O.
 */
'use strict';

// [{ model, plural, fields: [client-writable...], fieldTypes, computed: [system-only...],
//    writableBy: { field: [roles allowed to set it] }, anonymous, readableBy,
//    rowScope: { role: field } }]
const ENTITIES = [{"model":"attorney","plural":"attorneies","fields":["name","bar_number","state"],"fieldTypes":{"name":"String","bar_number":"String","state":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"dOJAccreditedRepresentative","plural":"dOJAccreditedRepresentatives","fields":["name","accreditation_expiration","organization"],"fieldTypes":{"name":"String","accreditation_expiration":"DateTime","organization":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"notario","plural":"notarios","fields":["name","advertising_language"],"fieldTypes":{"name":"String","advertising_language":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"governmentAgency","plural":"governmentAgencies","fields":["name","official_channels"],"fieldTypes":{"name":"String","official_channels":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"immigrationOrganization","plural":"immigrationOrganizations","fields":["name","recognition_expiration","address"],"fieldTypes":{"name":"String","recognition_expiration":"DateTime","address":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}}];

/**
 * Strict tenant scope — never an unscoped query (an undefined filter would leak
 * across tenants). Prefer org scoping; fall back to the owning user.
 *
 * E2: anonymous rows have no userId by construction, so the owner fallback would
 * match nothing and silently hide every report from its reviewers. Org scope
 * only; the role check is what restricts access there.
 *
 * E3 — row-level ownership scoping. Tenant scope alone answers "which org,"
 * not "which rows within it." A spec can declare `row_scope: { role: field }`
 * on an entity (e.g. InspectionRecord's `technician_id`, RentalAgreement's
 * `customer_id`) so that a caller in that role is additionally restricted to
 * rows where `field === req.user.id` — the field must store the owning
 * user's own id directly. Roles without a rowScope entry for this entity
 * (including admin) are unaffected. This does not resolve ownership through
 * a separate linked profile entity (e.g. a field that stores another
 * entity's id rather than the user's own) — that's a one-hop join the spec
 * author should flatten into a direct user-id field where row-level
 * enforcement matters.
 */
function scope(req, extra, entity) {
  const w = Object.assign({}, extra || {});
  if (req.user && req.user.orgId) w.orgId = req.user.orgId;
  else if (req.user && !(entity && entity.anonymous)) w.userId = req.user.id;
  const rs = entity && entity.rowScope;
  const role = req.user && req.user.role;
  if (rs && role && role !== 'admin' && rs[role]) w[rs[role]] = req.user.id;
  return w;
}

/**
 * E3 (write integrity) — the read half of row scoping restricts a role to
 * ITS OWN rows; this is the write half, restricting a role to writing ITS
 * OWN id into that same field. Without this, `scope()` alone still let a
 * row-scoped, non-admin role explicitly claim another user's id in a
 * request body (a technician filing an InspectionRecord as if it were a
 * different technician's) — a real gap, not a hypothetical one, caught in
 * review the same day this feature shipped. Admin may write any value
 * (e.g. filing on a user's behalf); a role with no rowScope entry for this
 * entity is unaffected.
 */
function rowScopeViolation(req, entity, data) {
  const rs = (entity && entity.rowScope) || {};
  const role = req.user && req.user.role;
  if (!role || role === 'admin') return false;
  const field = rs[role];
  if (!field || data[field] === undefined) return false;
  return data[field] !== req.user.id;
}

/** Keep only client-writable fields from a request body. */
function pick(body, fields) {
  const out = {};
  if (body && typeof body === 'object') {
    for (const f of fields) if (body[f] !== undefined) out[f] = body[f];
  }
  return out;
}

/**
 * E1 — the policy-gated fields in `data` the caller's role may NOT set, or []
 * when the write is allowed. Admin always passes.
 */
function fieldPolicyViolations(req, entity, data) {
  const wb = entity.writableBy || {};
  const role = req.user && req.user.role;
  if (role === 'admin') return [];
  const denied = [];
  for (const f of Object.keys(data)) {
    if (wb[f] && !wb[f].includes(role)) denied.push(f);
  }
  return denied;
}

/**
 * E2 — anonymous entities (whistleblower/complaint intake). Reads are restricted
 * to the roles the spec names in `readable_by` (admin always); "every colleague
 * can list who reported what" is the retaliation channel this flag prevents.
 */
function canReadAnonymous(req, entity) {
  if (!entity.anonymous) return true;
  const role = req.user && req.user.role;
  if (role === 'admin') return true;
  return Array.isArray(entity.readableBy) && entity.readableBy.includes(role);
}

/**
 * Identity columns are projected OUT of anonymous reads. The intake route never
 * writes userId, so this is belt-and-braces against a record created some other
 * way (an import, an older build) leaking a submitter.
 */
function readSelect(entity) {
  if (!entity.anonymous) return undefined;
  const sel = { id: true, createdAt: true, updatedAt: true };
  for (const f of entity.fields) sel[f] = true;
  for (const f of entity.computed || []) sel[f] = true;
  return sel;
}

module.exports = { ENTITIES, scope, pick, fieldPolicyViolations, canReadAnonymous, readSelect, rowScopeViolation };

