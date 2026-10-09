# Verification Certificate — Verifica

This platform was generated deterministically and then **verified by machine**
before delivery. This document records exactly what was checked, what passed,
and — just as importantly — what was **not** checked.

> **Scope of proof:** Final source passed its build gate but product readiness is scaffold_only; compilation alone is not product completion.

## Provenance

| Field | Value |
|---|---|
| Platform | Verifica |
| Archetype | saas-platform |
| Industry | cybersecurity |
| Generator version | 0.2.1 |
| Generator commit | 6bfe8f2 |
| Spec SHA-256 | a96fd55ae67514bfa8dd309685274dda8ec9605963bcf23e25932c96267e313c |

Regenerating from the same spec with the same generator version reproduces
this platform byte-for-byte — two independent engines are held to that by a
golden parity gate.

## Gates

| Gate | Result |
|---|---|
| build:dashboard:audit-dev | warning — devDependency advisories (not shipped in the runtime image): braces, chokidar, fast-glob, micromatch, tailwindcss |
| build:dashboard:audit-high | passed |
| build:dashboard:build | passed |
| build:dashboard:install | passed |
| build:dashboard:lock | passed |
| build:dashboard:lockfile | passed |
| build:server:audit-dev | warning — devDependency advisories (not shipped in the runtime image): @jest/console, @jest/core, @jest/environment, @jest/expect, @jest/fake-timers, @jest/globals, @jest/reporters, @jest/test-result, @jest/test-sequencer, @jest/transform, babel-jest, braces, create-jest, expect, jest, jest-circus, jest-cli, jest-config, jest-environment-node, jest-haste-map, jest-message-util, jest-resolve, jest-resolve-dependencies, jest-runner, jest-runtime, jest-snapshot, jest-watcher, micromatch |
| build:server:audit-high | passed |
| build:server:coverage | passed |
| build:server:eval | passed |
| build:server:install | passed |
| build:server:lock | passed |
| build:server:lockfile | passed |
| build:server:migration | passed — versioned migration present |
| build:server:runtime | passed |
| post-finish:dashboard:audit-dev | warning — devDependency advisories (not shipped in the runtime image): braces, chokidar, fast-glob, micromatch, tailwindcss |
| post-finish:dashboard:audit-high | passed |
| post-finish:dashboard:build | passed |
| post-finish:dashboard:install | passed |
| post-finish:dashboard:lock | passed |
| post-finish:dashboard:lockfile | passed |
| post-finish:server:audit-dev | warning — devDependency advisories (not shipped in the runtime image): @jest/console, @jest/core, @jest/environment, @jest/expect, @jest/fake-timers, @jest/globals, @jest/reporters, @jest/test-result, @jest/test-sequencer, @jest/transform, babel-jest, braces, create-jest, expect, jest, jest-circus, jest-cli, jest-config, jest-environment-node, jest-haste-map, jest-message-util, jest-resolve, jest-resolve-dependencies, jest-runner, jest-runtime, jest-snapshot, jest-watcher, micromatch |
| post-finish:server:audit-high | passed |
| post-finish:server:coverage | passed |
| post-finish:server:eval | passed |
| post-finish:server:install | passed |
| post-finish:server:lock | passed |
| post-finish:server:lockfile | passed |
| post-finish:server:migration | passed — versioned migration present |
| post-finish:server:runtime | passed |
| product-completion-gate | warning — readiness=scaffold_only; completion=10%; missing essential tools=bilingual-ui, channel-matcher, doj-roster-checker, statutory-rules-checker; workflow stubs=none |
| validate-agent-gateway | passed |
| validate-agents-tools | passed |
| validate-ai-economics | passed |
| validate-compliance-vertical | passed |
| validate-data-products | passed |
| validate-design-intelligence | passed |
| validate-framework-coverage | passed |
| validate-governance | passed |
| validate-growth | passed |
| validate-marketplace | passed |
| validate-operations | passed |
| validate-pricing | passed |
| validate-prisma | passed |
| validate-required-clauses | passed |
| validate-schema | passed |
| validate-security | passed |
| validate-spec-fidelity | passed |
| validate-syntax | passed |
| validate-tenancy | passed |
| validate-trust | passed |
| validate-trust-portal | passed |
| validate-vertical-pack | passed |
| validate-workflows | passed |
| security-scan (static) | passed — high 0, medium 0, low 0 |

## Tool implementations

Three categories, because two would overstate the first. A stub returning
invented data would be worse than no tool at all, so an anti-fabrication gate
rejects any "implementation" that produces random data with no external
source.

- **Implemented (6):** anomaly-detector, forecast, knowledge-search, risk-scorer, scorer, vuln-prioritizer
  Real logic that runs as generated, with no further configuration.
- **Credential-gated (0):** none
  Real HTTP adapters that ship in **mock mode**. They refuse with 501 in live
  mode until you set a base URL, so they are not working integrations yet —
  do not count them as delivered capability.
- **Honest stubs (4):** bilingual-ui, channel-matcher, doj-roster-checker, statutory-rules-checker
  Declared unimplemented; they refuse rather than fabricate.

## Product completion gate

- **Readiness:** scaffold_only
- **Implementation score:** 10%
- **Essential tools still missing:** bilingual-ui, channel-matcher, doj-roster-checker, statutory-rules-checker
- **Declared tools with no generated module:** none
- **Workflow stubs:** none
- **Credential-gated integrations:** none

This gate is separate from compilation: a build can pass while the product
remains a scaffold. Only `production_candidate` has no essential stubs.

## NOT checked

Do not read this certificate as more than it says. The following were never
examined and remain your responsibility:

- Business-logic correctness: whether the domain rules match YOUR policies, contracts, or regulator.
- Authorization intent: the gates prove the declared policy is enforced, not that the policy you declared is the right one.
- Load, performance, and resilience under production traffic.
- Dependency CVEs, container image contents, and the infrastructure you deploy onto.
- Whether operational controls (backups, on-call, scanning cadence) are actually operated — see server/trust/security-overview.md.
- Penetration testing and any third-party certification (SOC 2, ISO 27001, ATO).

## How to re-verify this yourself

Every claim above is reproducible without trusting us:

```bash
# 1. Every emitted server file parses
find server -name "*.js" -not -path "*/node_modules/*" -exec node --check {} \;
# 2. The app builds and boots
cd server && npm install && npx prisma db push && node index.js
# 3. The guarantees hold (generated policy tests)
cd server && npm test
```

Machine-readable form: `verification.json`.

