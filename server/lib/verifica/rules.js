'use strict';
/**
 * Deterministic red-flag rules for immigration-help fraud. The LLM only
 * extracts claims; every finding below is decided by code, carries a fixed
 * weight, a bilingual explanation, and the official guidance it comes from.
 */
const SOURCES = {
  eoir_fraud: { title: 'DOJ EOIR — Are You a Victim of Fraud? (self-help guide)', url: 'https://www.justice.gov/eoir/page/file/1480746/dl?inline=' },
  uscis_scams: { title: 'USCIS — Avoid Scams', url: 'https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams' },
  eoir_roster: { title: 'DOJ EOIR — Recognized Organizations and Accredited Representatives Roster', url: 'https://www.justice.gov/eoir/recognition-accreditation-roster-reports' },
};

const has = (list, re) => (list || []).some((x) => re.test(String(x)));

const NOTARIO = /\bnotari[oa]s?\b|\bnotary\b|\bnotario p[uú]blico\b/i;
const GOV = /\buscis\b|\bice\b|\bcbp\b|\bdhs\b|\bimmigration (office|services|department)\b|\bgobierno\b|\bgovernment\b|\bmigraci[oó]n\b|\bembajada\b|\bembassy\b/i;
const UNTRACEABLE = /gift ?card|tarjeta de regalo|crypto|bitcoin|usdt|western union|moneygram|wire transfer|transferencia|zelle|cash ?app|venmo|efectivo|cash only/i;
const GUARANTEE = /guarant|garantiz|100 ?%|seguro que|asegurad|sure approval|aprobaci[oó]n segura/i;
const URGENCY = /today only|hoy mismo|solo hoy|last chance|[uú]ltima oportunidad|deport|arrest|arresto|orden de captura|immediately|inmediatamente|24 ?h/i;
const BLANK_OR_LIE = /blank form|formulario en blanco|firmar en blanco|sign (it )?blank|false information|informaci[oó]n falsa|mentir|lie on/i;
const KEEP_DOCS = /keep (your )?(original|passport)|qued(ar|o) con (su|tu) (pasaporte|documentos originales)|entregar (el|su) pasaporte original/i;
const FORM_FEE = /pay for (the )?forms?|cobr\w* (por )?(los )?formularios|venta de formularios|buy (the )?forms?/i;
const ACCREDITED = /accredited|acreditad|representante (legal )?acreditad|doj (representative|accredited)/i;
const ATTORNEY = /\battorney\b|\blawyer\b|\babogad[oa]\b|\besq\b/i;

// weight: contribution to the risk score (negative = reassuring signal).
const RULES = [
  {
    id: 'government_impersonation', weight: 60, source: 'uscis_scams',
    test: (x) => x.claims_government_affiliation && (x.payment.requested || has(x.payment.methods, /./)),
    en: 'Claims to be from, or work with, USCIS/immigration/the government and asks you for money. USCIS does not ask for payment by phone, email, or through a private person.',
    es: 'Dice ser de USCIS, de migración o del gobierno, o trabajar con ellos, y le pide dinero. USCIS no pide pagos por teléfono, correo electrónico ni a través de una persona particular.',
  },
  {
    id: 'notario_offering_legal_help', weight: 45, source: 'eoir_fraud',
    test: (x, text) => has(x.claimed_titles, NOTARIO) || NOTARIO.test(text),
    en: 'Uses the title "notario"/"notary". In the United States a notary public is NOT a lawyer and cannot give immigration legal advice or represent you.',
    es: 'Usa el título de "notario". En Estados Unidos un notario público NO es abogado y no puede darle asesoría legal de inmigración ni representarle.',
  },
  {
    id: 'guaranteed_result', weight: 35, source: 'uscis_scams',
    test: (x, text) => has(x.promises, GUARANTEE) || GUARANTEE.test(text),
    en: 'Promises or guarantees a result (green card, visa, asylum, work permit). No one can guarantee an immigration decision.',
    es: 'Promete o garantiza un resultado (residencia, visa, asilo, permiso de trabajo). Nadie puede garantizar una decisión migratoria.',
  },
  {
    id: 'untraceable_payment', weight: 35, source: 'uscis_scams',
    test: (x, text) => has(x.payment.methods, UNTRACEABLE) || UNTRACEABLE.test(text),
    en: 'Asks for payment by gift card, cryptocurrency, wire transfer or cash apps. These are hard to trace and are a common sign of a scam.',
    es: 'Pide el pago con tarjetas de regalo, criptomonedas, transferencias o aplicaciones de pago. Son difíciles de rastrear y una señal común de estafa.',
  },
  {
    id: 'blank_forms_or_false_info', weight: 40, source: 'eoir_fraud',
    test: (x, text) => BLANK_OR_LIE.test(text) || has(x.document_requests, BLANK_OR_LIE),
    en: 'Asks you to sign blank forms or to give false information. Never sign a blank form or anything you do not understand.',
    es: 'Le pide firmar formularios en blanco o dar información falsa. Nunca firme un formulario en blanco ni algo que no entienda.',
  },
  {
    id: 'pressure_or_threat', weight: 20, source: 'uscis_scams',
    test: (x, text) => x.urgency || URGENCY.test(text),
    en: 'Uses pressure or threats (act today, risk of deportation or arrest). Legitimate help does not threaten you into paying.',
    es: 'Usa presión o amenazas (actuar hoy, riesgo de deportación o arresto). La ayuda legítima no le amenaza para que pague.',
  },
  {
    id: 'keeps_original_documents', weight: 20, source: 'eoir_fraud',
    test: (x, text) => KEEP_DOCS.test(text) || has(x.document_requests, KEEP_DOCS),
    en: 'Wants to keep your original documents (such as your passport). Keep your originals; give copies only.',
    es: 'Quiere quedarse con sus documentos originales (como su pasaporte). Guarde sus originales y entregue solo copias.',
  },
  {
    id: 'charges_for_forms', weight: 20, source: 'uscis_scams',
    test: (x, text) => FORM_FEE.test(text),
    en: 'Charges you for immigration forms. USCIS forms are free to download at uscis.gov.',
    es: 'Le cobra por los formularios de inmigración. Los formularios de USCIS se descargan gratis en uscis.gov.',
  },
];

// Roster-based findings: computed by verify.js from the roster lookups.
const ROSTER_FINDINGS = {
  claims_accredited_not_listed: {
    weight: 45, source: 'eoir_roster',
    en: (n) => `Says they are an accredited representative, but "${n}" does not appear on the official DOJ accreditation roster.`,
    es: (n) => `Dice ser representante acreditado, pero "${n}" no aparece en la lista oficial de acreditación del DOJ.`,
  },
  person_not_listed: {
    weight: 15, source: 'eoir_roster',
    en: (n) => `"${n}" is not on the DOJ list of accredited representatives. If they are not a licensed attorney either, they cannot legally represent you.`,
    es: (n) => `"${n}" no está en la lista del DOJ de representantes acreditados. Si tampoco es abogado con licencia, no puede representarle legalmente.`,
  },
  person_listed: {
    weight: -30, source: 'eoir_roster',
    en: (n) => `"${n}" appears on the official DOJ list of accredited representatives. Confirm the organization they work for before you pay.`,
    es: (n) => `"${n}" aparece en la lista oficial del DOJ de representantes acreditados. Confirme la organización donde trabaja antes de pagar.`,
  },
  org_not_listed: {
    weight: 15, source: 'eoir_roster',
    en: (n) => `"${n}" is not on the DOJ list of recognized organizations allowed to give immigration legal help.`,
    es: (n) => `"${n}" no está en la lista del DOJ de organizaciones reconocidas para dar ayuda legal de inmigración.`,
  },
  org_listed: {
    weight: -20, source: 'eoir_roster',
    en: (n) => `"${n}" is a DOJ-recognized organization.`,
    es: (n) => `"${n}" es una organización reconocida por el DOJ.`,
  },
  phone_mismatch: {
    weight: 30, source: 'eoir_roster',
    en: (n, p) => `The phone number you were given, ${p}, is not the number DOJ has on file for "${n}". Call the official number instead — someone may be using the organization's name.`,
    es: (n, p) => `El teléfono que le dieron, ${p}, no es el que el DOJ tiene registrado para "${n}". Llame al número oficial: alguien podría estar usando el nombre de la organización.`,
  },
  claims_attorney_unverified: {
    weight: 10, source: 'eoir_fraud',
    en: (n) => `Says they are an attorney${n ? ` ("${n}")` : ''}. Ask for their bar number and check it on your state bar's website before paying.`,
    es: (n) => `Dice ser abogado${n ? ` ("${n}")` : ''}. Pida su número de licencia (bar number) y verifíquelo en el sitio del colegio de abogados de su estado antes de pagar.`,
  },
};

module.exports = { RULES, ROSTER_FINDINGS, SOURCES, ACCREDITED, ATTORNEY, NOTARIO };
