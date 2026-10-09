/**
 * Role-based access control for Verifica (Phase 2.4).
 *
 * Real, spec-driven RBAC — not the binary admin check. ROLES is the catalog the
 * spec declared; middleware enforces it per route. 'admin' is always allowed.
 */
'use strict';

// [{ name, description, canWrite }] — canWrite null means "infer from the name".
const ROLES = [{"name":"admin","description":"Platform administrator with full access.","canWrite":true},{"name":"user","description":"Regular user submitting verification requests.","canWrite":false},{"name":"viewer","description":"Read-only access for viewing verification results.","canWrite":false}];

const READONLY_HINTS = /^(viewer|read.?only|auditor|guest|observer)$/i;

function roleNames() { return ROLES.map((r) => r.name); }

function isKnownRole(role) { return role === 'admin' || ROLES.some((r) => r.name === role); }

// Whether a role may perform writes (create/update/delete).
function isWriteRole(role) {
  if (role === 'admin') return true;
  const r = ROLES.find((x) => x.name === role);
  if (!r) return false;                 // unknown role → no write
  if (r.canWrite === false) return false;
  if (r.canWrite === true) return true;
  return !READONLY_HINTS.test(role);    // infer from the name when unspecified
}

// Require the caller's role to be one of `allowed` (admin always passes).
function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated', code: 'auth_required' });
    if (req.user.role === 'admin' || allowed.includes(req.user.role)) return next();
    return res.status(403).json({ error: 'forbidden', code: 'role_required', requiredAny: allowed });
  };
}

// Require any write-capable role.
function requireWrite(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated', code: 'auth_required' });
  if (isWriteRole(req.user.role)) return next();
  return res.status(403).json({ error: 'forbidden', code: 'write_role_required' });
}

module.exports = { ROLES, roleNames, isKnownRole, isWriteRole, requireRole, requireWrite };

