import React from 'react';

/**
 * Public legal / trust pages: /security, /privacy, /terms, /about.
 * One file so we add exactly one import to App.js. No external deps;
 * shares the visual language of LandingPage.
 *
 * Each page is a static React component fed by the constants below so
 * the generator can later swap in industry-specific copy without
 * touching the layout.
 */

const COLORS = {
  ink: 'hsl(210 40% 96%)',
  primary: 'hsl(263 70% 68%)',
  bg: 'hsl(222 47% 8%)',
  bgAlt: 'hsl(222 47% 13%)',
  border: 'hsl(217 33% 24%)',
  muted: 'hsl(215 20% 65%)',
};

const PLATFORM_NAME = 'Verifica';
const PLATFORM_ID = 'verifica';
// Nobody owns `<slug>.app`. These were invented addresses on the pages that
// carry the GDPR data-subject-rights contact and the vulnerability-disclosure
// contact, so real mail to either was dropped silently. HelpCenterPage fixed
// this and explained why; propagated here. Unset means the page says the
// deployment has no address, which is true and actionable, instead of
// printing one that fails.
const SUPPORT_EMAIL = process.env.REACT_APP_SUPPORT_EMAIL || '';
const PRIVACY_EMAIL = process.env.REACT_APP_PRIVACY_EMAIL || '';
const SECURITY_EMAIL = process.env.REACT_APP_SECURITY_EMAIL || '';

/** A mailto when an address is configured; an honest sentence when not. */
function ContactLink({ email, fallback }) {
  return email ? <a href={`mailto:${email}`}>{email}</a> : <span>{fallback}</span>;
}

const wrap = { maxWidth: 880, margin: '0 auto', padding: '0 1.25rem' };
// Operator-set, NOT stamped at generation time. This was hardcoded to
// 'April 2026' on Privacy, Terms, Security and About regardless of when the
// platform was built - a legal document dated by a constant somebody forgot
// to move. Stamping the build date would be worse in a different way: the
// date would change on a rebuild that altered nothing, and it would break
// the byte-for-byte reproducibility the Verification Certificate asserts.
// The right answer is that only YOU know when the terms last changed.
const lastUpdated = process.env.REACT_APP_LEGAL_LAST_UPDATED || '';

function PageShell({ title, kicker, children, onHome, onPricing, onLogin, currentPath }) {
  return (
    <div style={{ background: COLORS.bg, color: COLORS.ink, minHeight: '100vh', fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif' }}>
      <header style={{ borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.25rem' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); onHome(); }} style={{ fontWeight: 700, fontSize: '1.15rem', color: COLORS.ink, textDecoration: 'none' }}>
            {PLATFORM_NAME}
          </a>
          <nav style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
            <a href="#pricing" onClick={(e) => { e.preventDefault(); onPricing(); }} style={{ color: COLORS.muted, textDecoration: 'none', fontSize: '0.95rem' }}>Pricing</a>
            <button type="button" onClick={onLogin} style={{ padding: '0.5rem 1rem', borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.ink, cursor: 'pointer', fontSize: '0.9rem' }}>Sign in</button>
          </nav>
        </div>
      </header>

      <section style={{ background: COLORS.bgAlt, borderBottom: `1px solid ${COLORS.border}`, padding: '3rem 0 2rem' }}>
        <div style={wrap}>
          {kicker && <span style={{ display: 'inline-block', color: COLORS.primary, fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kicker}</span>}
          <h1 style={{ fontSize: '2.25rem', margin: '0 0 0.5rem', color: COLORS.ink }}>{title}</h1>
          <p style={{ color: COLORS.muted, fontSize: '0.95rem', margin: 0 }}>Last updated: {lastUpdated || 'not set for this deployment'}</p>
        </div>
      </section>

      <main style={{ ...wrap, padding: '2.5rem 1.25rem 4rem', lineHeight: 1.65, fontSize: '1rem', color: COLORS.ink }}>
        {children}
      </main>

      <footer style={{ background: COLORS.bg, borderTop: `1px solid ${COLORS.border}`, padding: '2rem 0', color: COLORS.muted, fontSize: '0.88rem' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', padding: '0 1.25rem' }}>
          <span>© {new Date().getFullYear()} {PLATFORM_NAME}. All rights reserved.</span>
          <nav style={{ display: 'flex', gap: '1.25rem' }}>
            {currentPath !== 'security' && <a href="#security" style={{ color: COLORS.muted, textDecoration: 'none' }}>Security</a>}
            {currentPath !== 'privacy'  && <a href="#privacy"  style={{ color: COLORS.muted, textDecoration: 'none' }}>Privacy</a>}
            {currentPath !== 'terms'    && <a href="#terms"    style={{ color: COLORS.muted, textDecoration: 'none' }}>Terms</a>}
            {currentPath !== 'about'    && <a href="#about"    style={{ color: COLORS.muted, textDecoration: 'none' }}>About</a>}
            <a
              href="#cookies"
              onClick={(e) => { e.preventDefault(); if (typeof window !== 'undefined' && typeof window.openCookieSettings === 'function') window.openCookieSettings(); }}
              style={{ color: COLORS.muted, textDecoration: 'none' }}
            >Cookie settings</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

const h2 = { fontSize: '1.4rem', margin: '2rem 0 0.75rem', color: COLORS.ink, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: '0.4rem' };
const h3 = { fontSize: '1.1rem', margin: '1.5rem 0 0.5rem', color: COLORS.ink };
const p  = { margin: '0 0 1rem' };
const ul = { margin: '0 0 1rem', paddingLeft: '1.25rem' };
const note = { background: COLORS.bgAlt, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '1rem 1.25rem', margin: '1.25rem 0', fontSize: '0.9rem', color: COLORS.muted };

/* ── /security ────────────────────────────────────────────────── */
export function SecurityPage(props) {
  return (
    <PageShell title="Security at a glance" kicker="Trust" currentPath="security" {...props}>
      <p style={p}>
        This page is a plain-language summary of the security controls that ship IN
        {PLATFORM_NAME} itself, and of the operational controls that depend on how
        your operator deploys it. Questions or disclosures:{' '}
        <ContactLink email={SECURITY_EMAIL} fallback={'No security contact is configured for this deployment — set REACT_APP_SECURITY_EMAIL.'} />.
      </p>

      <h2 style={h2}>Built into the product</h2>
      <ul style={ul}>
        <li>Tenant isolation at the application layer: every record is scoped to your organisation.</li>
        <li>Role-based access control on every route; scoped, revocable API keys.</li>
        <li>Sensitive fields envelope-encrypted at rest with rotatable keys; TLS enforced in transit.</li>
        <li>CSRF double-submit protection, rate limiting, and strict security headers on by default.</li>
        <li>A tamper-evident audit log of admin and data actions, exportable on demand.</li>
        <li>Self-serve data export and account erasure endpoints (no support ticket needed).</li>
      </ul>

      <h2 style={h2}>Deployment-dependent controls</h2>
      <p style={p}>
        Hosting region, data residency, backup schedules, uptime targets, and
        penetration testing depend on where and how this instance is operated.
        Ask your operator for their current statements on:
      </p>
      <ul style={ul}>
        <li>Hosting provider and region(s), and whether customer data leaves them.</li>
        <li>Backup cadence and restore objectives (RPO/RTO), and restore testing.</li>
        <li>External security assessments and their remediation status.</li>
      </ul>

      <h2 style={h2}>Incident response</h2>
      <p style={p}>
        We notify affected customers within 72 hours of confirming a security incident,
        in line with GDPR Article 33. Status updates are posted on the public status page
        and emailed to admin contacts.
      </p>

      <div style={note}>
        {/* This used to offer a SOC 2 report, a penetration-test summary and a
            one-business-day turnaround. None of the three exists in a freshly
            generated platform, and the section above correctly disclaims
            pentesting as an operator responsibility - so the page contradicted
            itself 22 lines apart. Say what is actually available. */}
        Security questions? Our machine-verifiable trust artifacts (control catalogue,
        sub-processors, retention schedule, DPA template) are at{' '}
        <a href="/api/trust/summary">/api/trust/summary</a>.{' '}
        <ContactLink
          email={SECURITY_EMAIL}
          fallback={'No security contact is configured for this deployment — set REACT_APP_SECURITY_EMAIL.'}
        />
      </div>

      <h2 style={h2}>Downloadable artifacts</h2>
      <ul style={ul}>
        <li><a href="/api/trust/documents/security-overview.md">Security overview (Markdown)</a></li>
        <li><a href="/api/trust/documents/security-controls.json">Security controls catalog (JSON)</a></li>
        <li><a href="/api/trust/documents/subprocessors.json">Sub-processor list (JSON)</a></li>
        <li><a href="/api/trust/documents/retention-schedule.json">Data-retention schedule (JSON)</a></li>
        <li><a href="/api/trust/pack">Full compliance pack (ZIP, signed manifest)</a></li>
      </ul>
    </PageShell>
  );
}

/* ── /privacy ─────────────────────────────────────────────────── */
export function PrivacyPage(props) {
  return (
    <PageShell title="Privacy notice" kicker="Legal" currentPath="privacy" {...props}>
      <p style={p}>
        This notice describes how {PLATFORM_NAME} ("we", "us") processes personal data
        as a <strong>controller</strong> for our website visitors and account contacts,
        and as a <strong>processor</strong> for data you upload into the platform under our
        Data Processing Addendum (DPA). It is written to satisfy GDPR Articles 13–14.
      </p>

      <h2 style={h2}>1. Controller</h2>
      <p style={p}>
        {PLATFORM_NAME} — contact <ContactLink email={PRIVACY_EMAIL} fallback={'No privacy contact is configured for this deployment — set REACT_APP_PRIVACY_EMAIL.'} />.
        EU representative and Data Protection Officer details are available on request.
      </p>

      <h2 style={h2}>2. Categories of personal data</h2>
      <ul style={ul}>
        <li><strong>Account data:</strong> name, email, organisation, role, hashed password, MFA enrolment.</li>
        <li><strong>Billing data:</strong> billing email, VAT ID, invoice history (held by Stripe; we receive metadata only).</li>
        <li><strong>Usage data:</strong> page views, feature interactions, error reports — used to operate and improve the service.</li>
        <li><strong>Customer content:</strong> the verifications and other records you create in {PLATFORM_NAME} — processed solely on your instructions under the DPA.</li>
      </ul>

      <h2 style={h2}>3. Purposes and legal bases</h2>
      <ul style={ul}>
        <li>Providing the service to you — performance of contract (Art. 6(1)(b)).</li>
        <li>Billing and accounting — legal obligation (Art. 6(1)(c)).</li>
        <li>Service security and abuse prevention — legitimate interests (Art. 6(1)(f)).</li>
        <li>Product analytics — legitimate interests, with cookie consent where required.</li>
      </ul>

      <h2 style={h2}>4. Data sharing</h2>
      <p style={p}>
        We use a limited set of sub-processors, configured per deployment. The
        authoritative, live list — with regions and DPAs — is published at{' '}
        <a href="/api/trust/documents/subprocessors.json">the sub-processor endpoint</a>{' '}
        and on the trust portal. We will notify you 30 days before adding a new
        sub-processor that handles customer content.
      </p>

      <h2 style={h2}>5. International transfers</h2>
      <p style={p}>
        Where a sub-processor transfers personal data outside your region, we rely on
        appropriate safeguards such as Standard Contractual Clauses (Decision (EU)
        2021/914) with supplementary measures (encryption in transit and at rest).
        Ask your operator for the residency posture of this deployment.
      </p>

      <h2 style={h2}>6. Retention</h2>
      <ul style={ul}>
        <li>Account data: until the account is deleted, then 30 days for backup recall.</li>
        <li>Billing data: as long as statutory accounting obligations require.</li>
        <li>Customer content: per the retention period configured in your account; you may export or erase at any time.</li>
      </ul>

      <h2 style={h2}>7. Your rights</h2>
      <p style={p}>
        Under GDPR you have the right to access, rectification, erasure, restriction,
        portability, and to object. To exercise any of these, email{' '}
        <ContactLink email={PRIVACY_EMAIL} fallback={'No privacy contact is configured for this deployment — set REACT_APP_PRIVACY_EMAIL.'} />. You may also lodge a
        complaint with your supervisory authority.
      </p>

      <h2 style={h2}>8. Cookies</h2>
      <p style={p}>
        We use strictly necessary cookies for session management and CSRF protection.
        Analytics cookies are loaded only after explicit consent via the cookie banner.
      </p>

      <div style={note}>
        Customers acting as controllers should sign our DPA — request a counter-signed
        copy at <ContactLink email={PRIVACY_EMAIL} fallback={'No privacy contact is configured for this deployment — set REACT_APP_PRIVACY_EMAIL.'} />.
      </div>

      <h2 style={h2}>Downloadable templates</h2>
      <p style={p}>
        For procurement and vendor-risk teams, the unsigned templates referenced above
        are downloadable directly:
      </p>
      <ul style={ul}>
        <li><a href="/api/trust/documents/privacy-template.md">Privacy notice template (Markdown)</a></li>
        <li><a href="/api/trust/documents/dpa-template.md">Data Processing Addendum template (Markdown)</a></li>
        <li><a href="/api/trust/documents/ropa-template.md">Record of Processing Activities (GDPR Art. 30)</a></li>
        <li><a href="/api/trust/documents/subprocessors.json">Sub-processor list (JSON)</a></li>
        <li><a href="/api/trust/pack">Full compliance pack (ZIP, signed manifest)</a></li>
      </ul>
    </PageShell>
  );
}

/* ── /terms ───────────────────────────────────────────────────── */
export function TermsPage(props) {
  return (
    <PageShell title="Terms of service" kicker="Legal" currentPath="terms" {...props}>
      <p style={p}>
        These terms ("Terms") govern your access to and use of {PLATFORM_NAME} (the "Service").
        By creating an account or using the Service you agree to these Terms. If you are
        accepting on behalf of an organisation you confirm you have authority to bind it.
      </p>

      <h2 style={h2}>1. The service</h2>
      <p style={p}>
        {PLATFORM_NAME} provides a cybersecurity platform: A bilingual web app that verifies the authenticity of individuals offering... The Service
        is a tool — it does not replace legal, financial, medical, or other professional advice.
      </p>

      <h2 style={h2}>2. Accounts</h2>
      <ul style={ul}>
        <li>You are responsible for the security of your credentials and for actions taken under your account.</li>
        <li>You must be at least 16 years old, or have parental consent.</li>
        <li>You will not share accounts; named seats only.</li>
      </ul>

      <h2 style={h2}>3. Acceptable use</h2>
      <p style={p}>You will not, and will not allow others to:</p>
      <ul style={ul}>
        <li>Reverse engineer or attempt to derive source code, except as permitted by mandatory law.</li>
        <li>Use the Service to violate applicable law, including data-protection and sanctions laws.</li>
        <li>Probe, scan, or test the security of the Service except under our published bug-bounty terms.</li>
        <li>Resell or sublicense the Service without a written agreement.</li>
      </ul>

      <h2 style={h2}>4. Fees and payment</h2>
      <ul style={ul}>
        <li>Paid plans renew automatically until cancelled. Cancel at any time from the billing portal.</li>
        <li>Fees are exclusive of VAT; we charge VAT where required.</li>
        <li>Refunds are issued only where required by law.</li>
      </ul>

      <h2 style={h2}>5. Customer content & data</h2>
      <p style={p}>
        You retain all rights in content you upload. You grant us the limited licence
        needed to operate the Service. Our processing of personal data on your behalf
        is governed by the DPA, which is incorporated into these Terms.
      </p>

      <h2 style={h2}>6. Confidentiality</h2>
      <p style={p}>
        Each party will protect the other's confidential information with the same care
        it uses for its own (and at least reasonable care).
      </p>

      <h2 style={h2}>7. Warranties & disclaimers</h2>
      <p style={p}>
        The Service is provided "as is" to the maximum extent permitted by law.
        We disclaim implied warranties of merchantability, fitness for a particular purpose,
        and non-infringement. {PLATFORM_NAME} does not warrant that any classification or
        document generated by the Service is sufficient to establish compliance with any
        specific regulation; you remain responsible for your own legal determinations.
      </p>

      <h2 style={h2}>8. Limitation of liability</h2>
      <p style={p}>
        To the maximum extent permitted by law, our aggregate liability for any claims
        arising out of or in connection with the Service is limited to the fees paid by
        you in the twelve months preceding the event giving rise to the claim. Neither
        party is liable for indirect, special, incidental, or consequential damages.
        Nothing in these Terms limits liability that cannot be limited by law (including
        for fraud, gross negligence, or personal injury).
      </p>

      <h2 style={h2}>9. Term & termination</h2>
      <ul style={ul}>
        <li>Either party may terminate for material breach not cured within 30 days of notice.</li>
        <li>You may export your data for 30 days after termination; we will then delete it.</li>
        <li>Sections that by their nature should survive termination will do so.</li>
      </ul>

      <h2 style={h2}>10. Governing law</h2>
      <p style={p}>
        These Terms are governed by the law stated in your order form or, absent one,
        the law of the operator's principal place of business — without prejudice to
        mandatory consumer protections in your country of residence.
      </p>

      <h2 style={h2}>11. Changes</h2>
      <p style={p}>
        We may update these Terms by giving 30 days' notice for material changes. Continued
        use of the Service after the effective date constitutes acceptance.
      </p>

      <div style={note}>
        Questions? Contact <ContactLink email={SUPPORT_EMAIL} fallback={'No support contact is configured for this deployment — set REACT_APP_SUPPORT_EMAIL.'} />.
      </div>

      <h2 style={h2}>Downloadable templates</h2>
      <p style={p}>
        For procurement teams, the unsigned templates are available directly:
      </p>
      <ul style={ul}>
        <li><a href="/api/trust/documents/tos-template.md">Terms of Service template (Markdown)</a></li>
        <li><a href="/api/trust/documents/dpa-template.md">Data Processing Addendum template (Markdown)</a></li>
        <li><a href="/api/trust/pack">Full compliance pack (ZIP, signed manifest)</a></li>
      </ul>
    </PageShell>
  );
}

/* ── /about ───────────────────────────────────────────────────── */
export function AboutPage(props) {
  return (
    <PageShell title={`About ${PLATFORM_NAME}`} kicker="Company" currentPath="about" {...props}>
      <p style={p}>
        {PLATFORM_NAME} is a cybersecurity platform: A bilingual web app that verifies the authenticity of individuals offering...
      </p>

      <h2 style={h2}>What you get</h2>
      <ul style={ul}>
        <li><strong>Verification management</strong> with a real API, search, exports, and history.</li>

        <li><strong>3 built-in AI agent(s)</strong> that work alongside your team, with humans approving anything sensitive.</li>


        <li><strong>A knowledge base with cited answers</strong> over the documents you ingest.</li>

        <li><strong>Multi-tenant workspaces</strong> with role-based access and a complete audit trail.</li>
      </ul>

      <h2 style={h2}>How we work</h2>
      <ul style={ul}>
        <li><strong>Audit-grade by default.</strong> Admin and data actions land in a tamper-evident, exportable activity log.</li>
        <li><strong>Open to scrutiny.</strong> Public trust portal, status endpoints, and a published sub-processor list.</li>
        <li><strong>Your data, your exit.</strong> Export and erasure are built-in self-serve endpoints.</li>
        <li><strong>Honest about scope.</strong> {PLATFORM_NAME} is a tool; its outputs support your decisions, they don't replace professional advice.</li>
      </ul>

      <h2 style={h2}>Contact</h2>
      <ul style={ul}>
        <li>General: <ContactLink email={SUPPORT_EMAIL} fallback={'No support contact is configured for this deployment — set REACT_APP_SUPPORT_EMAIL.'} /></li>
        <li>Privacy / GDPR requests: <ContactLink email={PRIVACY_EMAIL} fallback={'No privacy contact is configured for this deployment — set REACT_APP_PRIVACY_EMAIL.'} /></li>
        <li>Security disclosure: <ContactLink email={SECURITY_EMAIL} fallback={'No security contact is configured for this deployment — set REACT_APP_SECURITY_EMAIL.'} /></li>
      </ul>

      <div style={note}>
        Want to see {PLATFORM_NAME} in action? <a href="#pricing" onClick={(e) => { e.preventDefault(); props.onPricing(); }}>See pricing →</a>
      </div>
    </PageShell>
  );
}

export default { SecurityPage, PrivacyPage, TermsPage, AboutPage };

