# Verifica

A bilingual web app that verifies the authenticity of individuals offering immigration help before users pay or share documents.


> **Industry:** cybersecurity
> **Generated** by the platform generator. This is a **working application scaffold**:
> the horizontal infrastructure below is real and production-grade; the
> domain-specific agents, tools, and workflows are **generated stubs wired to a
> generic LLM runtime**. Read [What's real vs. what you must implement](#whats-real-vs-what-you-must-implement)
> before shipping — especially in regulated or safety-critical settings.

---

## Quickstart

```bash
# 1. Server
cd server
cp .env.example .env                 # server/.env.example — then set JWT_SECRET (required to boot)
#   generate one: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm install                          # postinstall runs `prisma generate`
npx prisma db push                   # create the SQLite schema (no migrations dir is shipped)
node index.js                        # API on http://localhost:4000

# 2. Dashboard (separate terminal)
cd dashboard
npm install
npm start                            # UI on http://localhost:3000

# 3. Tests
cd server && npm test
```

Defaults to **SQLite** (`file:./dev.db`) so it runs with zero external services.
For Postgres, set `DATABASE_URL` in `.env` (see comments there) and re-run
`npx prisma db push`. Redis is optional in dev (in-memory fallbacks are used).

---

## Architecture

- **Server** — Node/Express, Prisma ORM, JWT auth + refresh tokens, RBAC,
  per-tenant scoping, rate limiting, BullMQ background jobs, structured logging.
- **Dashboard** — React single-page app.
- **AI runtime** — a provider-agnostic tool-calling loop (`server/lib/agent-runtime.js`)
  over Anthropic / OpenAI / Ollama. Agents are declarative definitions; the
  runtime builds a system prompt from each agent and lets the model call tools.
- **Data** — Prisma schema in `server/prisma/schema.prisma`.

### Generated capabilities

**Agents (3)** — declarative definitions under `server/lib/agents/`, auto-loaded by the registry:

- **Claude** — AI model for text extraction and explanation

- **Jev** — AI model for decision-making

- **CustomClassifier** — AI model for scam probability assessment



**Tools (4)** — under `server/lib/tools/`. Each is an **adapter**: it runs on **labeled mock data** by default (results tagged `_mock: true`); set `INTEGRATION_<NAME>_MODE=live` and implement `realRun()` to connect the real system. In live mode an unimplemented integration **refuses** rather than fake it. Live/mock status is at `/api/health/integrations`:

- **Bilingual UI** — User interface supporting Spanish and English

- **DOJ Roster Checker** — Tool to verify against DOJ EOIR roster

- **Channel Matcher** — Tool to match contact channels with official records

- **Statutory Rules Checker** — Tool to apply statutory rules for verification



**Workflows (1)** — step definitions under `server/lib/workflows/`:

- **Verification Process** — 



---

## What's real vs. what you must implement

**Real and production-grade (horizontal infrastructure):**
- Authentication (JWT + refresh, login lockout), RBAC, per-tenant data scoping
- Tamper-evident audit log (hash-chained), AI guardrails (PII redaction,
  injection detection, token budgets), rate limiting, scoped API keys
- Health/readiness probes, graceful shutdown, Docker + deploy configs
- The generic LLM agent/tool/workflow runtime

**Generated scaffolding — implement before relying on it:**
- **Agent logic.** Each agent is a name/role/description/inputs/outputs
  definition with **no domain algorithm**. The "intelligence" is whatever the
  configured LLM does with that prompt. Anything requiring real math, models, or
  deterministic rules (forecasting, scoring, validation) must be written by you.
- **Integration tools run on mock data.** Every external integration (EHR/FHIR,
  supplier APIs, payment rails, data feeds, etc.) ships as an **adapter** with a
  working mock (results tagged `_mock: true`) and an empty `realRun()`. There are
  **no real network calls** to third-party systems until you implement `realRun()`
  and switch that tool to `live`. In live mode an unimplemented adapter throws —
  it never returns a fake result dressed as real.
- **Domain data model.** The Prisma schema models generic SaaS entities plus a
  single document-style `verification` record. Domain tables you need
  (inventory, transactions, domain-specific records) are **not** present — add them.
- **Domain analytics/KPIs.** Dashboards render generic platform pages; replace
  them with your real domain views and metrics.

⚠️ **Do not deploy this into a regulated, financial, or safety-critical workflow
on the assumption that the domain features work.** They are scaffolds. Treat the
LLM outputs as suggestions, not authoritative results, until backed by real
data sources and validated logic.

---

## Project layout

```
Verifica/
├── server/              # Express API, Prisma, auth, jobs, AI runtime
│   ├── index.js         # entrypoint
│   ├── prisma/          # schema.prisma
│   ├── routes/          # HTTP routes
│   ├── lib/
│   │   ├── agents/      # generated agent definitions
│   │   ├── tools/       # generated tools (integration tools are stubs)
│   │   └── workflows/   # generated workflow definitions
│   └── tests/           # jest unit + integration tests
├── dashboard/           # React app
├── Dockerfile           # single-container build (API + built dashboard)
└── DEPLOY.md            # deployment guide
```

## Deployment

See [DEPLOY.md](./DEPLOY.md). The Dockerfile builds the dashboard and serves it
from the API (`SERVE_DASHBOARD=1`) for a single-container deploy. Set
`JWT_SECRET`, `ENCRYPTION_KEY`, and `ENCRYPTION_SEARCH_KEY` (see `.env.example`)
in any non-dev environment — the server refuses to start in production without them.

