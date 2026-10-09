const { PrismaClient } = require('@prisma/client');
const { currentOrgId } = require('./tenant-context');

const { PrismaPg } = require('@prisma/adapter-pg');
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgres')) {
  throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
}
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const base = new PrismaClient({ adapter });

// ── Row-Level Security enforcement (Postgres only) ──────────────────────────
// For every query we set the LOCAL GUC `app.org_id` on the SAME connection (one
// transaction) so the RLS policies in prisma/rls.sql restrict every row to the
// caller's org AT THE DATABASE. This is a hard backstop under the app-level
// `where: { orgId }` scoping: a route that forgets the filter cannot leak
// another tenant's rows — PROVIDED the request runs inside a tenant context.
//
// Read that condition literally. The policy's predicate is
// `orgId = app.org_id OR app.org_id IS NULL`, so an unset GUC means
// UNRESTRICTED, not denied — deliberately, so seeds, migrations and system
// jobs work. The backstop is therefore only real on routes that run
// attachTenant (an audit found the spec-driven CRUD router did not, which is
// now fixed). Anywhere you add a new router touching org data, mount
// attachTenant or you are back to app-level scoping alone.
// NOTE: requires the RLS migration applied (`npm run db:rls`) AND the
// app DB role to be subject to RLS (the migration uses FORCE ROW LEVEL SECURITY).
// Verify enforcement against a real Postgres before relying on it in production.
function withRls(client) {
  return client.$extends({
    name: 'rls-tenant-isolation',
    query: {
      async $allOperations({ args, query }) {
        const orgId = currentOrgId();
        if (!orgId) return query(args);
        const [, result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.org_id', ${String(orgId)}, true)`,
          query(args),
        ]);
        return result;
      },
    },
  });
}

const prisma = withRls(base);

module.exports = prisma;

