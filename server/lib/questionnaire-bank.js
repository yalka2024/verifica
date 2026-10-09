/**
 * Security questionnaire bank (Tier 18 — Trust-to-revenue).
 *
 * Canonical Q&A library covering the 80% of vendor security questionnaires:
 *   - CAIQ-Lite (Cloud Security Alliance Consensus Assessments Initiative)
 *   - SIG-Lite (Shared Assessments)
 *   - Custom platform-specific items
 *
 * Each question has:
 *   - id               stable string e.g. 'caiq.aac-01'
 *   - framework        'caiq' | 'sig' | 'custom'
 *   - section          e.g. 'Access Control', 'Encryption'
 *   - question         the prompt
 *   - suggestedAnswer  a DRAFT for the operator to adopt, edit or reject
 *   - evidenceDocs     trust-pack documents the draft would cite
 *
 * IMPORTANT — `suggestedAnswer` is not an answer.
 *
 * These entries used to be served and exported as `answer`, asserting
 * quarterly access reviews, WebAuthn, production mTLS, weekly host scans,
 * an audited bastion, a 72h notification process and an annual third-party
 * pen test — none of which this platform ships, and two of which cited
 * evidence documents (pen-test-summary.md, tenancy-design.md) that do not
 * exist. They were written into CAIQ-Lite and SIG-Lite CSVs inside the
 * vendor kit ZIP, so a customer forwarded an industry-standard security
 * questionnaire, under their own name, containing assertions that were
 * false about their deployment.
 *
 * A question is ANSWERED only when the operator has written an override
 * (QuestionnaireOverride). Until then `answer` is null, `attested` is
 * false, and the public surface and the CSV export both say so.
 */
const prisma = require('./prisma');

/** Emitted in place of an answer the operator has not attested. */
const UNATTESTED =
  'NOT ANSWERED — this deployment has not attested to a control here. Answer it in Trust Portal -> Questionnaire before sending this to a prospect.';

const BANK = Object.freeze([
  // ---- CAIQ-Lite ----
  { id: 'caiq.aac-01', framework: 'caiq', section: 'Access Control',
    question: 'Are user access reviews performed at least annually?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. Verifica performs quarterly access reviews of all production systems and SaaS tools. Reviews are tracked in our access-review register and signed off by the security lead.',
    evidenceDocs: ['access-review-policy.md', 'soc2-summary.md'] },
  { id: 'caiq.aac-02', framework: 'caiq', section: 'Access Control',
    question: 'Is multi-factor authentication enforced for administrative access?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. All administrative access to production requires MFA via TOTP (RFC 6238) or WebAuthn. Customer-facing accounts can enable MFA via the security settings page.',
    evidenceDocs: ['access-review-policy.md'] },
  { id: 'caiq.cek-01', framework: 'caiq', section: 'Encryption',
    question: 'Is data encrypted at rest?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. Data at rest is encrypted using AES-256. Backups and object storage use provider-managed keys with key rotation.',
    evidenceDocs: ['encryption-policy.md'] },
  { id: 'caiq.cek-02', framework: 'caiq', section: 'Encryption',
    question: 'Is data encrypted in transit?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. All HTTP traffic uses TLS 1.2 or higher. Internal service-to-service traffic in production uses mTLS.',
    evidenceDocs: ['encryption-policy.md'] },
  { id: 'caiq.dsi-01', framework: 'caiq', section: 'Data Security',
    question: 'Can customers request deletion of their data?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. Customers can self-serve deletion via Settings → Data → Delete account. Backups containing the data are purged within 35 days.',
    evidenceDocs: ['data-handling-policy.md', 'dpa.md'] },
  { id: 'caiq.iam-01', framework: 'caiq', section: 'Identity Management',
    question: 'Are passwords stored using a strong one-way hash?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. Passwords are hashed with bcrypt (cost factor ≥ 12). Plaintext passwords are never logged or stored.',
    evidenceDocs: [] },
  { id: 'caiq.ivs-01', framework: 'caiq', section: 'Infrastructure & Virtualization',
    question: 'Are vulnerability scans performed on infrastructure?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. Container images are scanned on every build. Production hosts are scanned weekly. Critical findings are remediated within SLA defined in our vuln-mgmt policy.',
    evidenceDocs: ['vuln-mgmt-policy.md', 'pen-test-summary.md'] },
  { id: 'caiq.sef-01', framework: 'caiq', section: 'Security Incident Management',
    question: 'Do you have a documented incident response plan?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. Our incident-response runbook covers detection, triage, containment, eradication, recovery, and post-incident review. Sev1/Sev2 incidents trigger customer notification within 72 hours.',
    evidenceDocs: ['incident-response.md'] },

  // ---- SIG-Lite ----
  { id: 'sig.b1', framework: 'sig', section: 'Risk Management',
    question: 'Do you maintain a risk register?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. We maintain a risk register reviewed quarterly by the security lead and engineering leadership. Risks are scored by likelihood × impact and tracked to closure.',
    evidenceDocs: [] },
  { id: 'sig.f1', framework: 'sig', section: 'Information Asset Management',
    question: 'Do you classify data based on sensitivity?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. Data classifications: Public, Internal, Confidential, Restricted. Customer data is treated as Confidential by default; PII as Restricted.',
    evidenceDocs: ['data-handling-policy.md'] },
  { id: 'sig.h1', framework: 'sig', section: 'Network Security',
    question: 'Are production systems segregated from development?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. Production runs in a separate cloud account/VPC with no direct network path from development. Engineers gain time-bounded access via an audited bastion / SSO.',
    evidenceDocs: [] },
  { id: 'sig.l1', framework: 'sig', section: 'Threat Management',
    question: 'Do you perform third-party penetration testing?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. An independent firm conducts an annual pen test of Verifica. The most recent executive summary is available under NDA — see pen-test-summary.md.',
    evidenceDocs: ['pen-test-summary.md'] },
  { id: 'sig.p1', framework: 'sig', section: 'Privacy',
    question: 'Are sub-processors disclosed?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. The list of sub-processors is published at /trust and customers receive 30 days advance notice of additions or material changes.',
    evidenceDocs: ['subprocessors.md', 'dpa.md'] },

  // ---- Custom ----
  { id: 'custom.ai-01', framework: 'custom', section: 'AI / ML',
    question: 'Is customer data used to train third-party AI models?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: No. Verifica disables training on data sent to AI providers (e.g. OpenAI: data not used for model training; Anthropic: same). Prompts and outputs are retained for the minimum necessary period for abuse monitoring (30 days).',
    evidenceDocs: ['ai-usage-policy.md'] },
  { id: 'custom.tenancy-01', framework: 'custom', section: 'Multi-tenancy',
    question: 'Is data segregated between tenants?',
    suggestedAnswer: 'DRAFT, NOT ATTESTED - confirm this is true of YOUR deployment before sending: Yes. Every domain row is scoped by orgId; queries pass through a tenant-aware Prisma middleware that enforces orgId in WHERE clauses. See tenancy-design.md.',
    evidenceDocs: ['tenancy-design.md'] },
]);

// These two feed the UNAUTHENTICATED trust-portal endpoints, so they return
// the question and the draft under its own name — never an `answer` field a
// prospect could read as this deployment's position.
function listQuestions({ framework = null, section = null } = {}) {
  return BANK.filter(q =>
    (!framework || q.framework === framework) &&
    (!section || q.section === section)
  ).map(q => ({ ...q, answer: null, attested: false }));
}

function getQuestion(id) {
  const q = BANK.find(x => x.id === id);
  return q ? { ...q, answer: null, attested: false } : null;
}

function frameworks() {
  return Array.from(new Set(BANK.map(q => q.framework)));
}

function sections(framework = null) {
  return Array.from(new Set(BANK.filter(q => !framework || q.framework === framework).map(q => q.section)));
}

/** Apply per-org overrides on top of the canonical bank. */
// An entry is answered only if the operator wrote an override for it. The
// canonical text is a draft and is never promoted to `answer` on its own.
async function answersFor({ orgId = null } = {}) {
  const base = BANK.map(q => ({ ...q, answer: null, attested: false, source: 'unattested' }));
  if (!orgId) return base;
  const overrides = await prisma.questionnaireOverride.findMany({ where: { orgId } }).catch(() => []);
  if (!overrides.length) return base;
  const byId = new Map(overrides.map(o => [o.questionId, o]));
  return base.map(q => {
    const o = byId.get(q.id);
    if (!o || !o.answer) return q;
    return { ...q, answer: o.answer, attested: true, source: 'operator', updatedAt: o.updatedAt };
  });
}

async function upsertOverride(orgId, questionId, answer) {
  if (!orgId || !questionId) throw new Error('args_required');
  if (!getQuestion(questionId)) throw new Error('unknown_question');
  return prisma.questionnaireOverride.upsert({
    where: { orgId_questionId: { orgId, questionId } },
    create: { orgId, questionId, answer: String(answer || '').slice(0, 8000) },
    update: { answer: String(answer || '').slice(0, 8000), updatedAt: new Date() },
  });
}

async function deleteOverride(orgId, questionId) {
  await prisma.questionnaireOverride.deleteMany({ where: { orgId, questionId } }).catch(() => {});
}

/** Render the full Q&A as a CSV string suitable for upload to a vendor portal. */
async function renderCsv(opts = {}) {
  const rows = await answersFor(opts);
  const esc = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  // `attested` is a column, not a footnote: whoever opens this CSV must be
  // able to see which rows their organisation actually stands behind.
  const lines = [['id','framework','section','question','answer','attested','evidence_docs'].join(',')];
  for (const r of rows) {
    lines.push([
      r.id, r.framework, esc(r.section), esc(r.question),
      esc(r.attested ? r.answer : UNATTESTED),
      r.attested ? 'yes' : 'no',
      esc(r.attested ? (r.evidenceDocs || []).join('; ') : ''),
    ].join(','));
  }
  return lines.join('\n') + '\n';
}

module.exports = {
  BANK, UNATTESTED, listQuestions, getQuestion, frameworks, sections,
  answersFor, upsertOverride, deleteOverride, renderCsv,
};

