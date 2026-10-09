/**
 * Tenant-scoped data access for tools, agents, and workflow steps (E5).
 *
 * Before this existed, no file under lib/tools, lib/agents or lib/workflows
 * imported Prisma: the intelligence layer could not see the tables generic CRUD
 * writes. Tools computed things out of their inputs and threw the result away —
 * an external audit called it "~2,500 lines of deterministic-but-orphaned
 * transformations", which was fair.
 *
 * Everything here is scoped to ctx.orgId. There is deliberately no unscoped
 * accessor: a tool that can read across tenants is a data breach with a
 * plausible explanation.
 *
 * Usage inside a tool's realRun(input, ctx):
 *     const vendors = await ctx.data.list('vendor', { where: { status: 'pending' } });
 *     await ctx.data.setComputed('vendor', vendors[0].id, { risk_score: 87 });
 */
'use strict';
const prisma = require('./prisma');

// The SAME manifest object the CRUD router uses — imported, not re-emitted.
// It used to be a second `[{"model":"attorney","plural":"attorneies","fields":["name","bar_number","state"],"fieldTypes":{"name":"String","bar_number":"String","state":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"dOJAccreditedRepresentative","plural":"dOJAccreditedRepresentatives","fields":["name","accreditation_expiration","organization"],"fieldTypes":{"name":"String","accreditation_expiration":"DateTime","organization":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"notario","plural":"notarios","fields":["name","advertising_language"],"fieldTypes":{"name":"String","advertising_language":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"governmentAgency","plural":"governmentAgencies","fields":["name","official_channels"],"fieldTypes":{"name":"String","official_channels":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"immigrationOrganization","plural":"immigrationOrganizations","fields":["name","recognition_expiration","address"],"fieldTypes":{"name":"String","recognition_expiration":"DateTime","address":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}}]` literal here. Both copies were
// identical at generation and drifted the moment anyone edited one, which is
// how a UI kept offering fields the server had stopped accepting. One source.
const { ENTITIES } = require('./entity-policy');

function entity(name) {
  const key = String(name || '').toLowerCase();
  return ENTITIES.find((e) => e.model.toLowerCase() === key || e.plural.toLowerCase() === key) || null;
}

/** Org scope. Throws rather than silently returning another tenant's rows. */
function scopeOf(ctx) {
  const orgId = ctx && ctx.orgId;
  if (!orgId) {
    const e = new Error('tool data access requires an organization context (ctx.orgId)');
    e.code = 'no_tenant_context';
    throw e;
  }
  return { orgId };
}

function assertEntity(name) {
  const e = entity(name);
  if (!e) {
    const err = new Error(`unknown entity '${name}' — declare it in the spec's entities`);
    err.code = 'unknown_entity';
    throw err;
  }
  return e;
}

/** Build the ctx.data facade for one request/run. */
function forContext(ctx) {
  return {
    /** Entity names this platform exposes (handy for agents planning a step). */
    entities() {
      return ENTITIES.map((e) => ({ name: e.model, plural: e.plural, fields: e.fields, computed: e.computed || [] }));
    },

    async list(name, opts = {}) {
      const e = assertEntity(name);
      return prisma[e.model].findMany({
        where: Object.assign({}, scopeOf(ctx), opts.where || {}),
        orderBy: opts.orderBy || { createdAt: 'desc' },
        take: Math.min(Math.max(Number(opts.take) || 100, 1), 1000),
      });
    },

    async get(name, id) {
      const e = assertEntity(name);
      return prisma[e.model].findFirst({ where: Object.assign({ id: String(id) }, scopeOf(ctx)) });
    },

    async count(name, where = {}) {
      const e = assertEntity(name);
      return prisma[e.model].count({ where: Object.assign({}, scopeOf(ctx), where) });
    },

    async create(name, data) {
      const e = assertEntity(name);
      const allowed = new Set([...(e.fields || []), ...(e.computed || [])]);
      const clean = {};
      for (const [k, v] of Object.entries(data || {})) if (allowed.has(k)) clean[k] = v;
      clean.orgId = scopeOf(ctx).orgId;
      // Never attributes a row to a person: a tool acts as the system, and for
      // an `anonymous` entity attribution would defeat the point entirely.
      return prisma[e.model].create({ data: clean });
    },

    /**
     * Write the fields the spec marked `computed: true` — risk scores, flags,
     * verification states. This is the counterpart to E1: those fields are
     * closed to API clients precisely so that this path is the only writer.
     */
    async setComputed(name, id, patch) {
      const e = assertEntity(name);
      const computed = new Set(e.computed || []);
      const clean = {};
      for (const [k, v] of Object.entries(patch || {})) if (computed.has(k)) clean[k] = v;
      if (Object.keys(clean).length === 0) {
        const err = new Error(`no computed fields in patch for '${e.model}' (declared: ${[...computed].join(', ') || 'none'})`);
        err.code = 'no_computed_fields';
        throw err;
      }
      const res = await prisma[e.model].updateMany({
        where: Object.assign({ id: String(id) }, scopeOf(ctx)),
        data: clean,
      });
      // updateMany reports how many rows it touched and never throws on zero.
      // Returning that quietly meant a wrong id, or an id belonging to another
      // org, looked exactly like a successful write — the caller stored a
      // result nobody had persisted. There is no legitimate reason to compute a
      // value for a row that does not exist.
      if (res.count === 0) {
        const err = new Error(
          `setComputed('${name}', '${id}') matched no row — wrong id, or it belongs to another org`
        );
        err.code = 'no_such_record';
        throw err;
      }
      return res.count;
    },
  };
}

module.exports = { forContext, ENTITIES };

