#!/usr/bin/env node
'use strict';
/**
 * Build data/eoir/roster.json from the official DOJ EOIR Recognition &
 * Accreditation roster (by state), extracted with `pdftotext -layout`.
 *
 *   pdftotext -layout data/eoir/eoir-ra-roster-by-state-*.pdf data/eoir/roster.txt
 *   node scripts/build-roster.js
 *
 * Organizations: name, office, address, city/state/zip, phone.
 * Representatives: name, DHS-only flag, accreditation expiration, status.
 * (The PDF's column layout does not reliably tie a representative to an
 * organization after text extraction, so that link is not claimed.)
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'data', 'eoir');
const lines = fs.readFileSync(path.join(dir, 'roster.txt'), 'utf8').split(/\r?\n/);
const updated = (lines.join('\n').match(/Report Last Updated on:\s*([0-9/]+)/) || [])[1] || null;

const repStart = lines.findIndex((l) => /Accredited Representative\s+Accreditation/.test(l));
const PHONE = /^\(\d{3}\)\s*\d{3}-\d{4}/;
const CITY = /^(.+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?$/;

// ── Organizations ────────────────────────────────────────────────────────
// Left-column segments, in order. Columns are separated by 2+ spaces.
const left = [];
for (const l of lines.slice(0, repStart)) {
  const seg = l.trimEnd().split(/\s{2,}/)[0].trim();
  if (seg) left.push(seg);
}
const SKIP = /^(Recognized|Organization|Principal Office$|Disclaimer|�|Search by|Asterisk|rosters|it receives|order for|Organizations\. Each)/;
const organizations = [];
for (let i = 0; i < left.length; i++) {
  if (!/\bOffice$/.test(left[i])) continue;
  // Name: the segment(s) right before the office line (a long name can wrap).
  let j = i - 1;
  const nameParts = [];
  while (j >= 0 && nameParts.length < 2 && !PHONE.test(left[j]) && !CITY.test(left[j]) && !/\bOffice$/.test(left[j]) && !SKIP.test(left[j])) {
    nameParts.unshift(left[j]);
    j--;
  }
  const address = [];
  let k = i + 1;
  let city = null;
  for (; k < Math.min(left.length, i + 6); k++) {
    const m = left[k].match(CITY);
    if (m) { city = { city: m[1].trim(), state: m[2], zip: m[3] }; break; }
    address.push(left[k]);
  }
  const phone = k + 1 < left.length && PHONE.test(left[k + 1]) ? left[k + 1].match(PHONE)[0] : null;
  if (!nameParts.length || !city) continue;
  organizations.push({
    name: nameParts.join(' ').replace(/\s+/g, ' '),
    office: left[i],
    address: address.join(', '),
    ...city,
    phone,
  });
}

// ── Representatives ──────────────────────────────────────────────────────
const NAME = /^([A-Z][A-Za-z'’.\- ]+),\s+([A-Z][A-Za-z'’.\- ]*?)(\s*\(DHS(?: only\))?)?$/;
const DATE = /(\d{2}\/\d{2}\/\d{2})(\*)?/;
const representatives = [];
let repCol = null;
let last = null;
for (const l of lines.slice(repStart)) {
  const header = l.indexOf('Accredited Representative');
  if (header >= 0) { repCol = header; last = null; continue; }
  if (repCol === null || l.length <= repCol - 4) continue;
  // The representative column starts within a few chars of the header.
  const tail = l.slice(Math.max(0, repCol - 4));
  const lead = tail.match(/^\s*/)[0].length;
  if (lead > 8) continue;
  const seg = tail.trim().split(/\s{2,}|\s(?=\d{2}\/\d{2}\/\d{2})/)[0].trim();
  const date = tail.match(DATE);
  const m = seg.match(NAME);
  if (m) {
    last = { first: m[2].trim(), last: m[1].trim(),
      dhs_only: /\(DHS/.test(seg), expires: date ? date[1] : null, pending_renewal: !!(date && date[2]), status: /\bActive\b/.test(l) ? 'Active' : null };
    representatives.push(last);
  } else if (last && seg && !/^\d/.test(seg)) {
    // Wrapped continuation: "(DHS only)", "only)", or the rest of a first name.
    if (/DHS|only\)/.test(seg)) last.dhs_only = true;
    const extra = seg.replace(/\(?DHS\s*(only\))?|only\)/g, '').trim();
    if (extra && /^[A-Z][A-Za-z'’.\- ]+$/.test(extra) && extra.length < 30) {
      last.first = `${last.first} ${extra}`.replace(/\s+/g, ' ').trim();
    }
    if (!last.expires && date) { last.expires = date[1]; last.pending_renewal = !!date[2]; }
    if (!last.status && /\bActive\b/.test(l)) last.status = 'Active';
  }
}

const out = {
  source: 'DOJ EOIR Recognition & Accreditation Program — Recognized Organizations and Accredited Representatives Roster by State and City',
  source_url: 'https://www.justice.gov/eoir/recognition-accreditation-roster-reports',
  report_last_updated: updated,
  organizations,
  representatives: representatives.map(({ first, last: surname, ...rest }) => ({
    name: `${first} ${surname}`.replace(/\s+/g, ' '), last_first: `${surname}, ${first}`, ...rest,
  })),
};
fs.writeFileSync(path.join(dir, 'roster.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`roster updated ${updated}: ${organizations.length} organization offices, ${representatives.length} representatives`);
