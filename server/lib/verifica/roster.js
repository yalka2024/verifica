'use strict';
/**
 * Lookups against the official DOJ EOIR Recognition & Accreditation roster
 * (server/data/eoir-roster.json, built by scripts/build-roster.js).
 *
 * Matching is deliberately conservative: an exact (accent/case/order-
 * insensitive) name match is "listed"; a near match is only "possible" and
 * is never presented as verification.
 */
const path = require('path');

let cache = null;
function load() {
  if (!cache) {
    const raw = require(path.join(__dirname, '..', '..', 'data', 'eoir-roster.json'));
    cache = {
      meta: { source: raw.source, source_url: raw.source_url, report_last_updated: raw.report_last_updated },
      reps: raw.representatives.map((r) => ({ ...r, key: nameKey(r.name), tokens: tokens(r.name) })),
      orgs: raw.organizations.map((o) => ({ ...o, key: orgKey(o.name), phoneDigits: digits(o.phone) })),
    };
  }
  return cache;
}

function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function tokens(s) {
  return fold(s).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length > 1);
}
// Order-insensitive: "Garcia, Jose" and "Jose Garcia" share a key.
function nameKey(s) { return tokens(s).sort().join(' '); }
const ORG_NOISE = new Set(['inc', 'llc', 'corp', 'the', 'of', 'and', 'de', 'la', 'el', 'los', 'del', 'y']);
function orgKey(s) { return tokens(s).filter((t) => !ORG_NOISE.has(t)).sort().join(' '); }
function digits(s) {
  const d = String(s || '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

// Dice coefficient on token sets: robust to a missing middle name.
function overlap(a, b) {
  const A = new Set(a); const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const t of A) if (B.has(t)) n++;
  return (2 * n) / (A.size + B.size);
}

function findRepresentative(name) {
  const { reps } = load();
  const key = nameKey(name);
  if (!key) return { status: 'not_provided' };
  const exact = reps.filter((r) => r.key === key);
  if (exact.length) return { status: 'listed', matches: exact.slice(0, 3).map(publicRep) };
  const t = tokens(name);
  const near = reps
    .map((r) => ({ r, score: overlap(t, r.tokens) }))
    // Every given token must appear (a shared surname alone is not a match).
    .filter(({ r, score }) => score >= 0.8 && t.every((x) => r.tokens.includes(x)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (near.length) return { status: 'possible', matches: near.map(({ r }) => publicRep(r)) };
  return { status: 'not_listed' };
}

function findOrganization(name, phone) {
  const { orgs } = load();
  const key = orgKey(name);
  const phoneDigits = digits(phone);
  let byName = key ? orgs.filter((o) => o.key === key) : [];
  if (!byName.length && key) {
    const t = key.split(' ');
    byName = orgs.filter((o) => overlap(t, o.key.split(' ')) >= 0.85).slice(0, 5);
  }
  const byPhone = phoneDigits.length === 10 ? orgs.filter((o) => o.phoneDigits === phoneDigits) : [];
  if (!key && !phoneDigits) return { status: 'not_provided' };
  return {
    status: byName.length ? 'listed' : 'not_listed',
    matches: byName.slice(0, 5).map(publicOrg),
    // The phone someone gave you vs. the phone DOJ has on file for that name.
    phone: phoneDigits.length === 10
      ? { given: phone, on_file_for_name: byName.some((o) => o.phoneDigits === phoneDigits), listed_for: byPhone.slice(0, 3).map(publicOrg) }
      : null,
  };
}

function publicRep(r) {
  return { name: r.name, dhs_only: r.dhs_only, expires: r.expires, pending_renewal: r.pending_renewal, status: r.status };
}
function publicOrg(o) {
  return { name: o.name, office: o.office, address: o.address, city: o.city, state: o.state, zip: o.zip, phone: o.phone };
}

module.exports = { load, findRepresentative, findOrganization, nameKey, digits, meta: () => load().meta };
