# Agent Gateway

This platform publishes an agent capability manifest at
`/.well-known/agent-manifest.json` and an authenticated execution API at
`/api/agent-gateway`.

## Safety contract

- Only capabilities declared in the generation spec are exposed.
- API keys need `read`, `write`, `agent:read`, or `agent:execute` scopes.
- Capabilities marked `requires_confirmation` need a five-minute confirmation
  token minted from a browser cookie session. Machine credentials cannot mint it.
- Execution is tenant-scoped, rate-limited, and written to the tamper-evident
  activity audit chain.
- Discovery describes provenance and freshness; it does not claim truth.

Set `AGENT_CONFIRMATION_SECRET` to a separate secret of at least 32 random
characters in production. When absent, the server uses `JWT_SECRET`.

When `agent_readiness.model_routing` is enabled, `GET /api/agent-gateway/models`
lists only models whose providers are configured and `POST
/api/agent-gateway/complete` routes across those providers. Routing records
tokens, estimated cost, provider, model, and routing reason.

## Discovery

```http
GET /.well-known/agent-manifest.json
```

## One-variable Registry enrollment

Set `PUBLIC_URL=https://your-platform.example` and
`KUBILD_AGENT_REGISTRY_URL=https://agents.kubild.com`. At startup the platform
submits only its public manifest URL for validation and indexing, then refreshes
the submission periodically. Leave the Registry variable unset to disable all
outbound enrollment traffic. Discovery enrollment does not claim verified
ownership; complete the Registry's domain challenge for verified status.

## Execution

```http
POST /api/agent-gateway/execute
Authorization: ApiKey ...
Content-Type: application/json

{"capability":"search_verifications","arguments":{"query":"open","limit":10}}
```

