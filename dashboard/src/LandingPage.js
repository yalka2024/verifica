import React from 'react';
import { Button } from './components/ui/button';

/**
 * LandingPage — public marketing page for Verifica, RENDERED FROM THE
 * SPEC (inventory gap #1: this page previously hardcoded another product's
 * marketing). Every section derives from what this platform actually is:
 * hero from the spec summary, features from the declared agents + enabled
 * capabilities, trust cards from the controls that really ship, and the
 * AI-Act call-to-action only when the spec claims that framework.
 * The headline/subhead remain copy slots so `platformgen theme` (and the
 * product's finish pass) can sharpen them without touching structure.
 */

function Header({ onPricing, onLogin }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <a href="#" className="text-lg font-bold text-foreground no-underline">Verifica</a>
        <nav className="flex items-center gap-5">
          <a href="#features" className="text-sm text-muted-foreground no-underline hover:text-foreground">Features</a>
          <a href="#how" className="text-sm text-muted-foreground no-underline hover:text-foreground">How it works</a>
          <a href="#trust" className="text-sm text-muted-foreground no-underline hover:text-foreground">Trust</a>

          <a href="#pricing" onClick={(e) => { e.preventDefault(); onPricing(); }} className="text-sm text-muted-foreground no-underline hover:text-foreground">Pricing</a>

          <Button variant="outline" size="sm" onClick={onLogin}>Sign in</Button>
          <Button size="sm" onClick={onPricing}>Get started</Button>
        </nav>
      </div>
    </header>
  );
}

function Hero({ onPricing, onLogin }) {
  return (
    <section className="bg-gradient-to-b from-muted/40 to-background py-16">
      <div className="mx-auto max-w-6xl px-5 text-center">
        <span className="mb-4 inline-block rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
          Built for cybersecurity
        </span>
        <h1 className="mx-auto mb-4 max-w-3xl text-4xl font-bold leading-tight text-foreground">
          {/* copy:headline:start */}Secure Your Immigration Journey with Confidence{/* copy:headline:end */}
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {/* copy:subhead:start */}Verifica ensures you connect only with verified immigration professionals, protecting your sensitive information and finances. Our bilingual platform offers peace of mind by confirming the authenticity of service providers before you commit to sharing documents or making payments.{/* copy:subhead:end */}
        </p>
        <div className="mb-10 flex flex-wrap justify-center gap-3">
          <Button size="default" className="h-12 px-6 text-base" onClick={onPricing}>Get started free</Button>

          <Button variant="outline" className="h-12 px-6 text-base" onClick={onLogin}>Sign in</Button>
        </div>
        <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
          <span>✓ Multi-tenant with role-based access</span>
          <span>✓ Audit-grade activity log</span>

          <span>✓ Transparent plans, cancel any time</span>


        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="bg-background py-16">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="mb-2 text-center text-3xl font-bold text-foreground">
          What Verifica does
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-lg text-muted-foreground">
          Purpose-built for cybersecurity — these capabilities ship enabled, not as add-ons.
        </p>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-2 text-lg font-semibold text-foreground">Verification management</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">Create, organize, and track verifications with full-text search, exports, and a complete change history — backed by a real API your team can build on.</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-2 text-lg font-semibold text-foreground">Claude</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">AI model for text extraction and explanation</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-2 text-lg font-semibold text-foreground">Jev</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">AI model for decision-making</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-2 text-lg font-semibold text-foreground">CustomClassifier</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">AI model for scam probability assessment</p>
          </div>


          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-2 text-lg font-semibold text-foreground">Verification Process</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">Automated workflows move work forward without manual handoffs — every step logged, every run traceable.</p>
          </div>


          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-2 text-lg font-semibold text-foreground">Knowledge base with cited answers</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">Ingest your documents and get retrieval with citations — hybrid semantic + keyword search your agents can draw on.</p>
          </div>


          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-2 text-lg font-semibold text-foreground">4 operational tools</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">Domain tools your team and agents share — every invocation is authenticated, rate-limited, and recorded.</p>
          </div>


          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-2 text-lg font-semibold text-foreground">Built-in billing</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">Stripe-powered plans with usage metering and a self-serve customer portal — see the pricing page for exact tiers.</p>
          </div>

        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { n: 1, title: 'Create your workspace', body: 'Sign up, invite your team, and set roles — tenant isolation and access control are on from the first minute.' },
  { n: 2, title: 'Bring in your data', body: 'Add verifications by hand, import, or through the API. Everything is searchable and exportable.' },
  { n: 3, title: 'Put the platform to work', body: 'Run the built-in agents and tools on real work — with humans approving anything sensitive.' },
  { n: 4, title: 'Operate with confidence', body: 'Dashboards, analytics, and an audit trail show exactly what happened, when, and by whom.' },
];

function HowItWorks() {
  return (
    <section id="how" className="bg-muted/20 py-16">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="mb-10 text-center text-3xl font-bold text-foreground">How it works</h2>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-xl border border-border bg-card p-6">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{s.n}</div>
              <h3 className="mb-1 text-base font-semibold text-foreground">{s.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Trust() {
  return (
    <section id="trust" className="bg-background py-16">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="mb-2 text-center text-3xl font-bold text-foreground">
          Security and accountability, by construction
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-lg text-muted-foreground">
          These are controls that ship in the product — not promises on a slide.
        </p>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {[
            { t: 'Tenant isolation + RBAC', b: 'Every record is scoped to your organization; roles gate every route. API keys are scoped and revocable.' },
            { t: 'Encryption', b: 'TLS in transit; sensitive fields envelope-encrypted at rest with rotatable keys.' },
            { t: 'Audit trail', b: 'Admin and data actions land in a tamper-evident activity log you can export.' },
            { t: 'Your data, your exit', b: 'Full data export and account erasure are built-in self-serve endpoints, not a support ticket.' },
          ].map((c) => (
            <div key={c.t} className="rounded-xl border border-border bg-muted/20 p-5">
              <h3 className="mb-1 text-base font-semibold text-foreground">{c.t}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{c.b}</p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
          Compliance posture:

          <span className="mx-1 inline-block rounded-full border border-border px-2 py-0.5">GDPR</span>

          <span className="mx-1 inline-block rounded-full border border-border px-2 py-0.5">CCPA</span>

        </p>

        <div className="mt-8 text-center">
          <a href="#trust-portal" className="font-semibold text-primary no-underline hover:underline">
            Visit the public trust portal →
          </a>
        </div>
      </div>
    </section>
  );
}

function CTA({ onPricing }) {
  return (
    <section className="bg-card py-14 text-center">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="mb-3 text-2xl font-bold text-foreground">
          Ready to run cybersecurity on Verifica?
        </h2>
        <p className="mx-auto mb-7 max-w-xl text-lg text-muted-foreground">
          A bilingual web app that verifies the authenticity of individuals offering...
        </p>
        <Button className="h-12 px-7 text-base" onClick={onPricing}>Get started</Button>
      </div>
    </section>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  const linkCls = 'text-muted-foreground no-underline hover:text-foreground';
  return (
    <footer className="border-t border-border bg-background py-8 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5">
        {/* Growth loop: attribution badge — delete this span to opt out. */}
        <span>© {year} Verifica. All rights reserved. · <a href="https://github.com/Kryst-Investments-LLC/platform-generator" target="_blank" rel="noreferrer" className={linkCls}>Built with Kubild — generated &amp; verifiable</a></span>
        <nav className="flex flex-wrap gap-5">

          <a href="#pricing" className={linkCls}>Pricing</a>

          <a href="#help" className={linkCls}>Help centre</a>
          <a href="#security" className={linkCls}>Security</a>
          <a href="#privacy" className={linkCls}>Privacy</a>
          <a href="#terms" className={linkCls}>Terms</a>
          <a href="#about" className={linkCls}>About</a>
          <a href="#cookies" onClick={(e) => { e.preventDefault(); if (typeof window !== 'undefined' && typeof window.openCookieSettings === 'function') window.openCookieSettings(); }} className={linkCls}>Cookie settings</a>
        </nav>
      </div>

    </footer>
  );
}

export default function LandingPage({ onPricing, onLogin }) {
  const goPricing = onPricing || (() => { window.location.hash = '#pricing'; window.location.reload(); });
  const goLogin   = onLogin   || (() => { window.location.hash = '#login';   window.location.reload(); });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header onPricing={goPricing} onLogin={goLogin} />
      <Hero    onPricing={goPricing} onLogin={goLogin} />
      <Features />
      <HowItWorks />
      <Trust />
      <CTA onPricing={goPricing} />
      <Footer />
    </div>
  );
}

