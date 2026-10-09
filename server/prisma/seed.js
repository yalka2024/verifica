/**
 * Verifica — seed / bootstrap script.
 *
 * Behaviour:
 *  - Idempotent: safe to run on every deploy.
 *  - Bootstraps a default Organization and an initial admin user when none exists.
 *  - Reads ADMIN_EMAIL / ADMIN_PASSWORD from env. If ADMIN_PASSWORD is missing
 *    on first run, generates a strong random password and prints it once.
 *  - In production refuses placeholder credentials.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

const PROD = process.env.NODE_ENV === 'production';
const DEFAULT_ORG = process.env.DEFAULT_ORG_NAME || 'Verifica';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
let   ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const PLACEHOLDERS = new Set(['', 'change-me', 'changeme', 'password', 'admin']);

function generatePassword() {
  // 24 url-safe chars ≈ 144 bits entropy
  return crypto.randomBytes(18).toString('base64url');
}

async function ensureOrg() {
  let org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (org) return org;
  org = await prisma.organization.create({ data: { name: DEFAULT_ORG, plan: 'free' } });
  console.log(`[seed] created default organization id=${org.id} name=${org.name}`);
  return org;
}

async function ensureAdmin(org) {
  const existing = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (existing) {
    console.log(`[seed] admin user already exists (${existing.email}) — skipping`);
    return existing;
  }

  if (PROD && (PLACEHOLDERS.has(ADMIN_EMAIL) || ADMIN_EMAIL === 'admin@example.com')) {
    throw new Error('Refusing to seed: ADMIN_EMAIL is a placeholder in production. Set ADMIN_EMAIL.');
  }
  if (PROD && PLACEHOLDERS.has(ADMIN_PASSWORD)) {
    throw new Error('Refusing to seed: ADMIN_PASSWORD is a placeholder in production. Set ADMIN_PASSWORD.');
  }

  let printPassword = false;
  if (!ADMIN_PASSWORD) {
    ADMIN_PASSWORD = generatePassword();
    printPassword = true;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash,
      name: 'Administrator',
      role: 'admin',
      orgId: org.id,
      emailVerified: true,
    },
  });

  console.log(`[seed] created admin user id=${admin.id} email=${admin.email}`);
  if (printPassword) {
    console.log('');
    console.log('================================================================');
    console.log(' INITIAL ADMIN PASSWORD (shown once — store in a vault NOW):');
    console.log(`   ${ADMIN_PASSWORD}`);
    console.log('================================================================');
    console.log('');
  }
  return admin;
}


// ── Demo rows for the spec's own entities ───────────────────────────────
// A freshly generated platform used to open on empty tables — an auditor's
// words: "8 consecutive empty tables". That is a terrible first impression of
// software that IS working. Seeds a few obviously-fake rows per entity, ONLY
// when the table is empty, and never in production unless asked.
//   SEED_DEMO_DATA=0  -> off everywhere
//   NODE_ENV=production -> off unless SEED_DEMO_DATA=1
const DEMO_ENTITIES = [{"model":"attorney","plural":"attorneies","fields":["name","bar_number","state"],"fieldTypes":{"name":"String","bar_number":"String","state":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"dOJAccreditedRepresentative","plural":"dOJAccreditedRepresentatives","fields":["name","accreditation_expiration","organization"],"fieldTypes":{"name":"String","accreditation_expiration":"DateTime","organization":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"notario","plural":"notarios","fields":["name","advertising_language"],"fieldTypes":{"name":"String","advertising_language":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"governmentAgency","plural":"governmentAgencies","fields":["name","official_channels"],"fieldTypes":{"name":"String","official_channels":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"immigrationOrganization","plural":"immigrationOrganizations","fields":["name","recognition_expiration","address"],"fieldTypes":{"name":"String","recognition_expiration":"DateTime","address":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}}];

function demoValue(field, type, i) {
  const n = i + 1;
  switch (type) {
    case 'Int':      return n * 7;
    case 'Float':    return Number((n * 3.5).toFixed(2));
    case 'Decimal':  return String(n * 1250) + '.00';
    case 'Boolean':  return i % 2 === 0;
    case 'DateTime': return new Date(Date.now() - n * 86400000);
    default:         return `[demo] ${field} ${n}`;
  }
}

async function seedDemoData(org) {
  const enabled = process.env.SEED_DEMO_DATA === '1'
    || (process.env.SEED_DEMO_DATA !== '0' && process.env.NODE_ENV !== 'production');
  if (!enabled) return;
  for (const e of DEMO_ENTITIES) {
    try {
      const existing = await prisma[e.model].count();
      if (existing > 0) continue;   // never touch a table that has real data
      for (let i = 0; i < 3; i++) {
        const data = { orgId: org.id };
        for (const f of e.fields) data[f] = demoValue(f, (e.fieldTypes || {})[f], i);
        // Computed fields belong to agents/system code, but demo rows look
        // dead without them, so they are populated here too.
        for (const f of (e.computed || [])) data[f] = demoValue(f, (e.fieldTypes || {})[f], i);
        await prisma[e.model].create({ data });
      }
      console.log(`[seed] ${e.model}: 3 demo rows`);
    } catch (err) {
      console.warn(`[seed] ${e.model}: demo rows skipped (${err.message})`);
    }
  }
}
async function main() {
  const org = await ensureOrg();
  await ensureAdmin(org);
  await seedDemoData(org);
  console.log('[seed] done');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });

