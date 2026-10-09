/**
 * Policy guarantees for Verifica — generated (E12).
 *
 * Verifica advertises four access-control guarantees. Advertising them
 * is not the same as enforcing them, and an external audit of a generated
 * platform found exactly that gap: the controls existed, nothing proved them.
 *
 * These tests execute the REAL policy helpers from lib/entity-policy.js (the
 * same module routes/entities.js enforces with) against the REAL entity
 * manifest this platform was generated from. They need no
 * database and no network, so they run on every commit in your own CI:
 *
 *   1. Computed fields are unreachable from client payloads.
 *   2. `writable_by` fields reject roles that are not named (maker-checker),
 *      including a `writable_by` field the spec also marked `computed`.
 *   3. Anonymous entities are readable only by their named roles, and never
 *      return submitter identity.
 *   4. Every query is tenant-scoped — no unscoped reads.
 *   5. `row_scope` roles are restricted to rows they own, not just their org.
 *   6. A row-scoped role cannot claim another user's id in a write — the read
 *      restriction (5) is only half the guarantee without this half.
 *
 * If you change the spec, regenerate: these tests are regenerated with it.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// The REAL production predicates — lib/entity-policy.js is what
// routes/entities.js enforces with, and it is dependency-free so these tests
// need no database, no server, and no network.
const {
  ENTITIES,
  scope,
  pick,
  fieldPolicyViolations,
  canReadAnonymous,
  readSelect,
  rowScopeViolation,
} = require('../../lib/entity-policy');
const withComputed = ENTITIES.filter((e) => (e.computed || []).length > 0);
const withRoleGated = ENTITIES.filter((e) => Object.keys(e.writableBy || {}).length > 0);
const anonymous = ENTITIES.filter((e) => e.anonymous);
const withRowScope = ENTITIES.filter((e) => Object.keys(e.rowScope || {}).length > 0);

describe('tenant isolation', () => {
  test('every entity query carries an organization scope', () => {
    for (const e of ENTITIES) {
      const w = scope({ user: { id: 'u1', orgId: 'org-1' } }, null, e);
      expect(w.orgId).toBe('org-1');
    }
  });

  test('a request without an org still never yields an unscoped filter', () => {
    for (const e of ENTITIES) {
      const w = scope({ user: { id: 'u1' } }, null, e);
      // Either owner-scoped, or (for anonymous entities) intentionally org-only
      // — what must never happen is an empty filter that matches every tenant.
      const scoped = w.userId === 'u1' || e.anonymous === true;
      expect(scoped).toBe(true);
    }
  });
});

(withComputed.length ? describe : describe.skip)('computed fields are system-owned', () => {
  test.each(withComputed.map((e) => [e.model, e]))('%s: client payloads cannot set computed fields', (_name, e) => {
    const payload = {};
    for (const f of e.computed) payload[f] = 'ATTACKER_SUPPLIED';
    for (const f of e.fields) payload[f] = 'ok';
    const accepted = pick(payload, e.fields);
    for (const f of e.computed) expect(accepted).not.toHaveProperty(f);
  });
});

(withRoleGated.length ? describe : describe.skip)('maker-checker on role-gated fields', () => {
  test.each(withRoleGated.map((e) => [e.model, e]))('%s: an unauthorized role is refused', (_name, e) => {
    for (const [field, allowedRoles] of Object.entries(e.writableBy)) {
      const data = { [field]: 'approved' };
      // A role that is NOT permitted must be reported as a violation.
      const denied = fieldPolicyViolations({ user: { role: '__not_allowed__' } }, e, data);
      expect(denied).toContain(field);
      // Each permitted role must be accepted.
      for (const role of allowedRoles) {
        expect(fieldPolicyViolations({ user: { role } }, e, data)).toEqual([]);
      }
      // admin is the documented escape hatch.
      expect(fieldPolicyViolations({ user: { role: 'admin' } }, e, data)).toEqual([]);
    }
  });
});

(anonymous.length ? describe : describe.skip)('anonymous intake protects submitters', () => {
  test.each(anonymous.map((e) => [e.model, e]))('%s: only the named roles can read', (_name, e) => {
    expect(canReadAnonymous({ user: { role: '__random_employee__' } }, e)).toBe(false);
    for (const role of e.readableBy || []) {
      expect(canReadAnonymous({ user: { role } }, e)).toBe(true);
    }
    expect(canReadAnonymous({ user: { role: 'admin' } }, e)).toBe(true);
  });

  test.each(anonymous.map((e) => [e.model, e]))('%s: reads never return submitter identity', (_name, e) => {
    const select = readSelect(e);
    expect(select).toBeTruthy();
    expect(select).not.toHaveProperty('userId');
  });

  test('the public intake route never records who submitted', () => {
    const intake = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'public-intake.js'), 'utf8');
    expect(intake).not.toMatch(/data\.userId\s*=/);
    // Unauthenticated by design — requiring a login to report anonymously is a
    // contradiction, because the account IS the identity.
    expect(intake).not.toMatch(/authMiddleware/);
  });
});

(withRowScope.length ? describe : describe.skip)('row-level ownership scoping', () => {
  test.each(withRowScope.map((e) => [e.model, e]))('%s: a row-scoped role is filtered to its own rows', (_name, e) => {
    for (const [role, field] of Object.entries(e.rowScope)) {
      const w = scope({ user: { id: 'u1', orgId: 'org-1', role } }, null, e);
      expect(w[field]).toBe('u1');
    }
  });

  test.each(withRowScope.map((e) => [e.model, e]))('%s: admin is never row-scoped', (_name, e) => {
    for (const field of Object.values(e.rowScope)) {
      const w = scope({ user: { id: 'u1', orgId: 'org-1', role: 'admin' } }, null, e);
      expect(w).not.toHaveProperty(field);
    }
  });

  test.each(withRowScope.map((e) => [e.model, e]))('%s: a role with no rowScope entry for this entity is unaffected', (_name, e) => {
    const w = scope({ user: { id: 'u1', orgId: 'org-1', role: '__unrelated_role__' } }, null, e);
    for (const field of Object.values(e.rowScope)) {
      expect(w).not.toHaveProperty(field);
    }
  });

  test.each(withRowScope.map((e) => [e.model, e]))('%s: a row-scoped role cannot write another user\'s id into its scope field', (_name, e) => {
    for (const [role, field] of Object.entries(e.rowScope)) {
      // Claiming someone else's id is a violation...
      expect(rowScopeViolation({ user: { id: 'u1', role } }, e, { [field]: 'someone-else' })).toBe(true);
      // ...writing your own id is not...
      expect(rowScopeViolation({ user: { id: 'u1', role } }, e, { [field]: 'u1' })).toBe(false);
      // ...omitting the field entirely is not (the route auto-fills it)...
      expect(rowScopeViolation({ user: { id: 'u1', role } }, e, {})).toBe(false);
      // ...and admin may write any value, e.g. filing on a user's behalf.
      expect(rowScopeViolation({ user: { id: 'u1', role: 'admin' } }, e, { [field]: 'someone-else' })).toBe(false);
    }
  });
});

