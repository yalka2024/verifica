# Verifica — Security Overview

> **TEMPLATE — UNATTESTED. Do not send this to a customer, auditor, or procurement
> reviewer until the attestation block at the bottom is signed.**
>
> This document has two halves, and the difference matters legally:
>
> - **Part 1 — Implemented in code.** Verifiable by reading this repository. True
>   of the generated software as delivered.
> - **Part 2 — Operator commitments (NOT YET TRUE).** Scan cadence, on-call,
>   backup restores, breach-notification SLAs and build-provenance levels depend
>   on how *you* run this platform. They are deliberately left unfilled.
>   Publishing them before they are real is a misrepresentation — and against a
>   government buyer, potential False Claims Act exposure.

---

## Part 1 — Implemented in code (verifiable in this repository)

### Architecture
- **Web tier:** Express 5 on Node 20 LTS, designed to sit behind a reverse proxy that terminates TLS.
- **API tier:** Same process; rate-limited per-IP and per-API-key (`server/lib/ratelimit.js`).
- **Background workers:** BullMQ on Redis for async/scheduled work (webhook delivery, usage aggregation, dunning sweep).
- **Persistence:** PostgreSQL in development, CI, and production via Prisma.
- **Object storage:** Pluggable driver (`local` for dev, `s3` for production).

### Identity & Access
- Cookie sessions on the dashboard, JWT (15-minute access, 14-day refresh) for the API.
- MFA (TOTP, RFC-6238); refresh-token rotation with family-wide reuse detection.
- Passwords: bcrypt cost 12, account lockout, enumeration-safe reset.
- API keys hashed at rest; only the prefix is shown after issue.
- CSRF cookie issued on every request, enforced on unsafe methods (excluded for `Authorization: Bearer` and `x-api-key`).

### Cryptography
- AES-256-GCM envelope encryption, per-item data keys, versioned key IDs, rotation fallback (`server/lib/crypto.js`).
- Secrets fail closed: boot refuses a placeholder `JWT_SECRET`, or a SQLite `DATABASE_URL` in production.
- TLS is terminated at *your* edge — this code does not itself provide TLS or HSTS preloading.

### Audit & Logging
- Structured JSON access logs with `requestId` correlation (`x-request-id`).
- Append-only `Activity` table for security-relevant events (login, MFA toggle, admin action, data export).
- Webhook delivery is SSRF-guarded (private/loopback/link-local/CGNAT/cloud-metadata blocked, redirects not followed) with signed payloads and attempt history.

### Data Protection
- DSR endpoints under `/api/privacy/dsr` (access, erasure, portability).
- Tenant data scoped by `orgId` in the application layer.
- Uploads: size limits, extension allowlist, magic-byte sniffing, CSV formula-injection neutralization.

### Supply chain (in the shipped CI workflows)
- Container images SBOM'd (CycloneDX/SPDX) and signed with cosign keyless (Sigstore).
- Dependency-scanning workflow present.

---

## Part 2 — Operator commitments — **UNFILLED, NOT YET TRUE**

Fill each line with what you will actually do, or delete it. Never publish a line
you could not evidence on the day a customer asks.

| Control | Status | Your commitment |
|---|---|---|
| Vulnerability scan cadence, and whether findings **block** a release | ☐ not configured | `<<SET>>` |
| Build provenance level (SLSA) — attestations exist; the **level** depends on your builder isolation | ☐ not assessed | `<<SET>>` |
| On-call / paging rotation | ☐ none | `<<SET>>` |
| Backup schedule **and a tested restore** (an untested backup is not a control) | ☐ never tested | `<<SET>>` |
| Personal-data breach notification SLA | ☐ not committed | `<<SET>>` |
| Postmortem publication commitment | ☐ not committed | `<<SET>>` |
| Penetration test (date, scope, firm) | ☐ never performed | `<<SET>>` |
| Third-party audit / certification (SOC 2, ISO 27001, ATO…) | ☐ none | `<<SET>>` |
| Sub-processor list reviewed and attested (`trust/subprocessors.json`) | ☐ template | `<<SET>>` |

### Attestation

```
Attested by: <<NAME, ROLE>>
Date:        <<YYYY-MM-DD>>
Statement:   Every line in Part 2 above is accurate for this deployment as of this date.
```

Until that block is signed, treat this document as internal.

---

## Reporting vulnerabilities

Security contact: `<<SET: security contact email>>` — see `SECURITY.md`.
Set a real, monitored address before publishing anything in this directory.

