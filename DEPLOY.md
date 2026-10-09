# Deploying Verifica

This platform ships with a single-container Docker image that bundles the
Express API server and the built React dashboard (served as static assets
from the same origin). **Railway is the primary supported deployment target.**
The Fly.io and Google Cloud Run instructions are experimental reference targets:
they are not included in Kubild's release-blocking browser/runtime certification.

## Required environment variables

| Variable        | Notes                                                                 |
| --------------- | --------------------------------------------------------------------- |
| `JWT_SECRET`    | 32+ char random string. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DATABASE_URL`  | `postgresql://...` — Railway/Fly inject this when you attach Postgres |
| `CORS_ORIGIN`   | Public https URL of your app (e.g. `https://verifica.fly.dev`) |
| `DIRECT_URL`    | **Required if `DATABASE_URL` is pooled** (PgBouncer/Supabase/Neon pooler). Unpooled direct connection for migrations. |
| `AUDIT_HMAC_KEY` | 32+ char independent key; mandatory in production for keyed audit-chain integrity. |
| `MFA_ENCRYPTION_KEY` | 32+ char independent key; mandatory in production for MFA-secret encryption. |

Optional: `SENTRY_DSN`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`,
`AV_SCAN_URL`, `STORAGE_DRIVER=s3` + S3 credentials.

## Railway

```
railway init                     # pick "Empty Project"
railway add --database postgres  # sets DATABASE_URL
railway variables --set JWT_SECRET=...
railway variables --set CORS_ORIGIN=https://<your-railway-domain>
railway up                       # builds Dockerfile + deploys
```

Railway reads [`railway.json`](railway.json) for the healthcheck path and
start command. Migrations run via `npx prisma db push` at boot.

## Fly.io

> Experimental target. Validate the complete build, migration, boot, health,
> billing, and rollback gates in your environment before serving customers.

```
fly launch --no-deploy --copy-config
fly postgres create --name verifica-db --region fra
fly postgres attach verifica-db          # sets DATABASE_URL
fly secrets set JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
fly secrets set CORS_ORIGIN=https://verifica.fly.dev
fly deploy
```

`primary_region = "fra"` (Frankfurt) keeps EU customer data in-region and is
useful for EU AI Act market-surveillance defensibility. Change to
`iad` / `lhr` / `syd` as needed. The `[[mounts]]` block reserves `/data` for
local uploads; swap `STORAGE_DRIVER=s3` for production-scale storage.

## Google Cloud Run

> Experimental target. It is not part of the primary Railway release gate.

Cloud Run builds the Dockerfile via Cloud Build and runs the container
stateless; use a managed Postgres (Cloud SQL, Neon, or Supabase) and run the
schema setup once from your machine against the production `DATABASE_URL`
(Cloud Run has no pre-deploy hook):

```
# one-time DB setup from your machine (or re-run after schema changes)
cd server
DATABASE_URL="postgresql://..." ADMIN_EMAIL=... ADMIN_PASSWORD=... npx prisma db push

# deploy (from the project root; uses the Dockerfile)
gcloud run deploy verifica --source . --region us-central1 --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,SERVE_DASHBOARD=1,AI_PROVIDER=gemini \
  --set-secrets DATABASE_URL=...,JWT_SECRET=...,ENCRYPTION_KEY=...,ENCRYPTION_SEARCH_KEY=...,GEMINI_API_KEY=...
```

Store secrets in Secret Manager (`gcloud secrets create`) and reference them
with `--set-secrets`. After the first deploy, set `CORS_ORIGIN` to the printed
`*.run.app` URL and redeploy. `AI_PROVIDER=gemini` + `GEMINI_API_KEY` route all
model calls through the Gemini API.

## Self-host (Docker Compose)

`docker-compose.yml` runs the full stack on your own server — Postgres, Redis,
the API server, the background worker, and the dashboard — with no managed
provider involved.

```
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
export ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
export ENCRYPTION_SEARCH_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
export AUDIT_HMAC_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
export MFA_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
docker compose up -d --build
```

All five are required — the server exits on boot if any is missing or a
placeholder in production. Put them in a `.env` file next to
`docker-compose.yml` (Compose loads it automatically) instead of re-exporting
on every restart. Dashboard: `http://localhost:3000/`  ·  API:
`http://localhost:4000/api/health`. Swap `STORAGE_DRIVER=s3` (+ S3 credentials)
in the compose file for production-scale upload storage; the default `local`
driver writes into a named volume.

## Local Docker test (single container, no Postgres/Redis wired up)

```
docker build -t verifica .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))") \
  -e CORS_ORIGIN="http://localhost:8080" \
  verifica
```

Dashboard: `http://localhost:8080/`  ·  API: `http://localhost:8080/api/health`

## Notes

- The seed creates the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars
  (default email `admin@example.com`); if `ADMIN_PASSWORD` is unset it generates
  a random password and prints it **once**. In production the seed refuses
  placeholder credentials — set real values before the first deploy.
- `SERVE_DASHBOARD=1` makes the server host the dashboard build. For separate
  front-end deploys (e.g. Vercel + Railway), unset it and deploy `dashboard/build`
  independently, pointing `REACT_APP_API_URL` at the server origin.
- Health endpoints: `/api/health` (detailed), `/api/health/live` (liveness),
  `/api/health/ready` (readiness — respects graceful drain).

