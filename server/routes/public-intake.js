/**
 * Anonymous intake for Verifica (E2).
 *
 * Entities the spec marks `anonymous: true` — whistleblower reports, ethics
 * complaints, safety concerns — get a submission path that CANNOT identify the
 * submitter, because the alternative is a retaliation channel wearing an
 * anonymity label:
 *
 *   - No authentication. Requiring a login to report anonymously is a
 *     contradiction; the account IS the identity.
 *   - `userId` is never written. Not "stripped later" — never set.
 *   - No IP, user-agent, or request-id is persisted with the record.
 *   - Reads live in routes/entities.js and are restricted to the entity's
 *     `readable_by` roles, with identity columns projected out.
 *
 * The submitter receives a reference code to follow up with. There is
 * deliberately no way to map that code back to a person.
 *
 * When no entity is marked anonymous, ANON_ENTITIES is [] and this router is a
 * harmless no-op.
 */
const express = require('express');
const prisma = require('../lib/prisma');
const limiters = require('../lib/ratelimit');
const { asyncHandler } = require('../lib/validate');

const router = express.Router();

// Same manifest as routes/entities.js; only the anonymous entities are served here.
const ANON_ENTITIES = [{"model":"attorney","plural":"attorneies","fields":["name","bar_number","state"],"fieldTypes":{"name":"String","bar_number":"String","state":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"dOJAccreditedRepresentative","plural":"dOJAccreditedRepresentatives","fields":["name","accreditation_expiration","organization"],"fieldTypes":{"name":"String","accreditation_expiration":"DateTime","organization":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"notario","plural":"notarios","fields":["name","advertising_language"],"fieldTypes":{"name":"String","advertising_language":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"governmentAgency","plural":"governmentAgencies","fields":["name","official_channels"],"fieldTypes":{"name":"String","official_channels":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"immigrationOrganization","plural":"immigrationOrganizations","fields":["name","recognition_expiration","address"],"fieldTypes":{"name":"String","recognition_expiration":"DateTime","address":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}}].filter((e) => e.anonymous);

// Anonymous submissions are unauthenticated, so the abuse budget is per-IP and
// tight. The IP is used for rate limiting only — it is never persisted.
const intakeLimiter = limiters.makeLimiter({ windowMs: 60 * 60_000, max: 10, name: 'public-intake' });

/**
 * Which organization owns anonymous submissions. Single-tenant deployments (the
 * common case for an ethics hotline) resolve automatically. Multi-tenant
 * deployments MUST set PUBLIC_INTAKE_ORG_ID — guessing would file a report with
 * the wrong organization, which for a whistleblower is a disclosure.
 */
let cachedOrgId;
async function resolveIntakeOrgId() {
  if (cachedOrgId !== undefined) return cachedOrgId;
  if (process.env.PUBLIC_INTAKE_ORG_ID) {
    cachedOrgId = process.env.PUBLIC_INTAKE_ORG_ID;
    return cachedOrgId;
  }
  const orgs = await prisma.organization.findMany({ select: { id: true }, take: 2 });
  cachedOrgId = orgs.length === 1 ? orgs[0].id : null;
  return cachedOrgId;
}

function pick(body, fields) {
  const out = {};
  if (body && typeof body === 'object') {
    for (const f of fields) if (body[f] !== undefined) out[f] = body[f];
  }
  return out;
}

for (const e of ANON_ENTITIES) {
  router.post(
    '/' + e.plural,
    intakeLimiter,
    asyncHandler(async (req, res) => {
      const orgId = await resolveIntakeOrgId();
      if (!orgId) {
        return res.status(503).json({
          error: 'intake_unconfigured',
          message:
            'Anonymous intake is not configured: set PUBLIC_INTAKE_ORG_ID to the organization that receives these reports.',
        });
      }
      const data = pick(req.body, e.fields);
      if (Object.keys(data).length === 0) return res.status(400).json({ error: 'empty_submission' });
      data.orgId = orgId;
      // userId is deliberately NOT set — this is the whole point of the route.
      const row = await prisma[e.model].create({ data, select: { id: true } });
      // Echo nothing back but the reference: a reflected payload is a way to
      // confirm a guess about what someone submitted.
      res.status(201).json({ ok: true, reference: row.id });
    }),
  );
}

module.exports = router;

