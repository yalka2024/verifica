/**
 * Platform-superadmin authority (E7).
 *
 * `role === 'admin'` is a TENANT role: the seed mints it, and a tenant admin can
 * promote users to it. Gating cross-tenant surfaces (every org's name, plan,
 * spend and margin) on that role means any customer admin can enumerate every
 * other customer — which an external audit found on /api/admin/tenants.
 *
 * Platform authority is therefore deliberately NOT stored in the database that
 * tenants can influence. It comes from the deployment's own environment:
 *
 *     PLATFORM_ADMIN_EMAILS=you@yourcompany.com,ops@yourcompany.com
 *
 * Unset => nobody has it, and cross-tenant routes are closed. That is the right
 * default: a fresh deployment should not silently expose every tenant to
 * whoever registers first.
 */
'use strict';

function platformAdminEmails() {
  return String(process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isPlatformAdmin(user) {
  if (!user || !user.email) return false;
  const allow = platformAdminEmails();
  if (allow.length === 0) return false;
  return allow.includes(String(user.email).toLowerCase());
}

/** Express guard for cross-tenant surfaces. Runs AFTER authMiddleware. */
function requirePlatformAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated', code: 'auth_required' });
  if (!isPlatformAdmin(req.user)) {
    return res.status(403).json({
      error: 'Platform administrator access required',
      code: 'platform_admin_required',
      hint: 'Tenant admin is not platform admin. Set PLATFORM_ADMIN_EMAILS on the deployment.',
    });
  }
  next();
}

module.exports = { isPlatformAdmin, requirePlatformAdmin, platformAdminEmails };

