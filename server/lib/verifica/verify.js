'use strict';
/**
 * Verifica: "verify before you pay or share documents".
 *
 *   message/ad + optional name/org/phone
 *     -> AI extracts claims (extract.js)
 *     -> code checks them against the official DOJ EOIR roster (roster.js)
 *        and fixed red-flag rules from USCIS/EOIR guidance (rules.js)
 *     -> deterministic score + bilingual, source-cited findings
 *
 * The verdict is never produced by the model, so the same input always gets
 * the same answer and every reason points at an official source.
 */
const roster = require('./roster');
const { RULES, ROSTER_FINDINGS, SOURCES, ACCREDITED, ATTORNEY, NOTARIO } = require('./rules');
const { extractClaims, stripNegated } = require('./extract');

const clip = (s, n = 200) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
const HONORIFIC = /^(?:(?:lic|licda?|licenciad[oa]|dr|dra|sr|sra|srta|mr|mrs|ms|atty|abog|abogad[oa]|notari[oa]|officer|agent|agente|oficial)\.?\s+)+/i;
const stripHonorific = (s) => clip(s).replace(HONORIFIC, '').replace(/,?\s+esq\.?$/i, '').trim();
const GOV_AGENCY = /^(?:u\.?s\.?\s+)?(?:uscis|ice|cbp|dhs|eoir|department of homeland security|immigration and customs enforcement|citizenship and immigration services|migraci[oó]n|inmigraci[oó]n|embassy|embajada)\b/i;

function finding(id, weight, source, en, es) {
  return { id, weight, severity: weight >= 40 ? 'high' : weight >= 15 ? 'medium' : weight < 0 ? 'reassuring' : 'low', en, es, source: SOURCES[source] };
}

async function verify(input = {}, deps = {}) {
  const text = clip(input.text, 6000);
  const { claims, method, model, note } = await extractClaims(text, deps);

  // Explicit form fields are authoritative and join the extracted claims.
  // A roster check needs a real name: at least two words, not just a title the
  // model mistook for a name ("notario", "the lawyer").
  const people = [...new Set([clip(input.name), ...claims.person_names].map(stripHonorific)
    .filter((n) => n && n.split(/\s+/).length >= 2 && !NOTARIO.test(n) && !ATTORNEY.test(n) && !ACCREDITED.test(n)))].slice(0, 3);
  // Government agencies are not "organizations offering help": impersonating
  // one is caught by the government_impersonation rule instead.
  const orgs = [...new Set([clip(input.organization), ...claims.organization_names].filter((o) => o && !GOV_AGENCY.test(o)))].slice(0, 3);
  const phones = [...new Set([clip(input.phone, 40), ...claims.phones].filter(Boolean))].slice(0, 3);
  const haystack = [stripNegated(text), ...claims.claimed_titles, ...claims.promises, ...claims.services].join('\n');

  const findings = [];
  for (const rule of RULES) {
    if (rule.test(claims, haystack)) findings.push(finding(rule.id, rule.weight, rule.source, rule.en, rule.es));
  }

  const claimsAccredited = claims.claimed_titles.some((t) => ACCREDITED.test(t)) || ACCREDITED.test(text);
  const claimsAttorney = claims.claimed_titles.some((t) => ATTORNEY.test(t)) || ATTORNEY.test(text);
  const checks = { people: [], organizations: [] };

  for (const name of people) {
    const r = roster.findRepresentative(name);
    checks.people.push({ name, ...r });
    const F = ROSTER_FINDINGS;
    if (r.status === 'listed') findings.push(finding('person_listed', F.person_listed.weight, F.person_listed.source, F.person_listed.en(name), F.person_listed.es(name)));
    else if (r.status === 'not_listed' && claimsAccredited) findings.push(finding('claims_accredited_not_listed', F.claims_accredited_not_listed.weight, 'eoir_roster', F.claims_accredited_not_listed.en(name), F.claims_accredited_not_listed.es(name)));
    else if (r.status === 'not_listed' && !claimsAttorney) findings.push(finding('person_not_listed', F.person_not_listed.weight, 'eoir_roster', F.person_not_listed.en(name), F.person_not_listed.es(name)));
  }
  if (claimsAttorney) {
    const F = ROSTER_FINDINGS.claims_attorney_unverified;
    findings.push(finding('claims_attorney_unverified', F.weight, F.source, F.en(people[0]), F.es(people[0])));
  }

  for (const org of orgs) {
    const r = roster.findOrganization(org, phones[0]);
    checks.organizations.push({ name: org, ...r });
    const F = ROSTER_FINDINGS;
    if (r.status === 'listed') {
      // A real organization's name with a number DOJ doesn't have on file is
      // the impersonation pattern itself — the listing must not reassure then.
      if (r.phone && !r.phone.on_file_for_name) findings.push(finding('phone_mismatch', F.phone_mismatch.weight, 'eoir_roster', F.phone_mismatch.en(org, r.phone.given), F.phone_mismatch.es(org, r.phone.given)));
      else findings.push(finding('org_listed', F.org_listed.weight, 'eoir_roster', F.org_listed.en(org), F.org_listed.es(org)));
    } else if (r.status === 'not_listed') {
      findings.push(finding('org_not_listed', F.org_not_listed.weight, 'eoir_roster', F.org_not_listed.en(org), F.org_not_listed.es(org)));
    }
  }

  // Warning signs and roster matches are scored separately: a scammer can copy
  // a real representative's name, so a match must never cancel a warning.
  const score = Math.min(100, findings.filter((f) => f.weight > 0).reduce((s, f) => s + f.weight, 0));
  const identityChecked = checks.people.length + checks.organizations.length > 0 || phones.length > 0;
  const risk = score >= 60 ? 'high' : score >= 25 ? 'medium' : score > 0 ? 'low'
    // Nothing suspicious AND nothing verifiable is "not enough information",
    // never "no red flags".
    : identityChecked ? 'low' : 'inconclusive';
  const lang = input.lang === 'es' || input.lang === 'en' ? input.lang : claims.language === 'es' ? 'es' : 'en';

  return {
    risk, score, lang,
    headline: {
      high: { en: 'High risk: do not pay or hand over documents yet.', es: 'Riesgo alto: no pague ni entregue documentos todavía.' },
      medium: { en: 'Caution: verify these points before you pay.', es: 'Precaución: verifique estos puntos antes de pagar.' },
      low: { en: 'No red flags found in what you shared. This is not a guarantee — still verify before paying.', es: 'No encontramos señales de alerta en lo que compartió. No es una garantía: verifique antes de pagar.' },
      inconclusive: { en: 'Not enough information — identity not verified. Add the person\'s name, the organization, or the phone number they gave you.', es: 'No hay suficiente información: la identidad no está verificada. Agregue el nombre de la persona, la organización o el teléfono que le dieron.' },
    }[risk],
    findings: findings.sort((a, b) => b.weight - a.weight),
    checks,
    claims,
    extraction: { method, model: model || null, note: note || null },
    next_steps: {
      en: ['Look up the person or organization on the official DOJ roster.', 'Only an attorney or a DOJ-accredited representative at a recognized organization may give you immigration legal help.', 'Never pay with gift cards, crypto or wire transfers, and keep your original documents.', 'Report the scam: uscis.gov/report-fraud or reportfraud.ftc.gov'],
      es: ['Busque a la persona u organización en la lista oficial del DOJ.', 'Solo un abogado o un representante acreditado por el DOJ en una organización reconocida puede darle ayuda legal de inmigración.', 'Nunca pague con tarjetas de regalo, criptomonedas ni transferencias, y guarde sus documentos originales.', 'Denuncie la estafa: uscis.gov/report-fraud o reportfraud.ftc.gov'],
    },
    roster: roster.meta(),
    disclaimer: {
      en: 'Verifica is a verification aid, not legal advice. Roster data comes from the U.S. Department of Justice and may lag recent changes.',
      es: 'Verifica es una ayuda para verificar, no asesoría legal. Los datos provienen del Departamento de Justicia de EE. UU. y pueden no reflejar cambios recientes.',
    },
  };
}

module.exports = { verify };
