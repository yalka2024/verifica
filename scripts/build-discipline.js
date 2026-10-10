#!/usr/bin/env node
'use strict';
/**
 * Build server/data/eoir-discipline.json from DOJ EOIR's "List of Currently
 * Disciplined Practitioners" (HTML table), saved as data/eoir/disciplined.html:
 *
 *   curl -sSL -o data/eoir/disciplined.html https://www.justice.gov/eoir/list-of-currently-disciplined-practitioners
 *   node scripts/build-discipline.js
 */
const fs = require('fs');
const path = require('path');

const SRC = 'https://www.justice.gov/eoir/list-of-currently-disciplined-practitioners';
const html = fs.readFileSync(path.join(__dirname, '..', 'data', 'eoir', 'disciplined.html'), 'utf8');
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();
const link = (s) => { const m = s.match(/href="([^"]+)"/); return m ? new URL(m[1], 'https://www.justice.gov').href : null; };

const updated = (text(html).match(/(?:last )?updated(?: on)?:?\s*([A-Z][a-z]+ \d{1,2}, \d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i) || [])[1] || null;
const table = html.slice(html.indexOf('<table'), html.lastIndexOf('</table>'));
const rows = table.split(/<tr[\s>]/i).slice(1);
const header = (rows[0].match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || []).map(text);
const practitioners = [];
for (const row of rows.slice(1)) {
  const cells = row.match(/<td[\s\S]*?<\/td>/gi) || [];
  if (cells.length < 4) continue;
  const c = cells.map(text);
  // Columns: Name | City/State | Date Immediate Suspension Imposed |
  // Final Discipline Imposed | Effective Date of Discipline | Reinstated?
  const date = (v) => (/\d/.test(v) ? v.replace(/\(PDF\)/g, '').trim() : null);
  const rec = {
    name: c[0], location: c[1],
    immediate_suspension: date(c[2]), immediate_suspension_order: link(cells[2]),
    sanction: c[3] && !/^-+$/.test(c[3]) ? c[3] : null,
    effective: date(c[4]), order_link: link(cells[4]) || link(cells[2]),
    reinstated: c[5] || null,
  };
  if (rec.name && !/^-+$/.test(rec.name)) practitioners.push(rec);
}
const out = { source: 'DOJ EOIR — List of Currently Disciplined Practitioners', source_url: SRC, list_last_updated: updated, columns: header, practitioners };
const file = path.join(__dirname, '..', 'server', 'data', 'eoir-discipline.json');
fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
console.log(`updated ${updated}: ${practitioners.length} practitioners; columns: ${header.join(' | ')}`);
