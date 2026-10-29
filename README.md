# payconnectoid

payconnectoid is published as an open-core release.
The public repository is live at https://github.com/LehroSolutions/payconnectiod and the first public GitHub release is https://github.com/LehroSolutions/payconnectiod/releases/tag/v0.1.0.
The open-source repository contains the core orchestration server, adapters, webhook delivery infrastructure, analytics, and MCP surfaces.
Commercial-only features should live in a separate private codebase or private workspace folder and are intentionally not shipped in this repository.

## Release Status

- Public repository and `v0.1.0` tag are live on GitHub.
- Release assets include a versioned `openapi.yaml` and `.env.example`.
- GitHub Private Vulnerability Reporting is enabled in the repository security settings.

## Release Assets

- Release page: https://github.com/LehroSolutions/payconnectiod/releases/tag/v0.1.0
- OpenAPI contract: https://github.com/LehroSolutions/payconnectiod/releases/download/v0.1.0/payconnectoid-v0.1.0-openapi.yaml
- Environment example: https://github.com/LehroSolutions/payconnectiod/releases/download/v0.1.0/payconnectoid-v0.1.0.env.example

payconnectoid provides a payment orchestration core with:

- Session auth with access and refresh tokens
- Canonical v2 API envelopes
- Idempotent payment creation with persisted idempotency records
- Lifecycle transition enforcement (`initiated -> authorized -> settled|failed`)
- Webhook signature verification and trace capture
- Reconciliation summaries in minor currency units
- Provider-backed payment verification and refunds
- Persisted outbound webhook queue replay across restarts
- MCP access over stdio, HTTP JSON-RPC, and HTTP+SSE
- Time-windowed refund and delivery analytics for dashboards
- Root operator console with AI risk scoring

## Run

- `bun start`
- Open `http://127.0.0.1:4106`

## Test

- `bun test`

Release baseline: the published `v0.1.0` release passed `bun test` and local smoke checks for `/api/health`, `/api/ready`, and `/api/v2/openapi.json`.

## Auth

- Login endpoint: `POST /api/auth/login`
- Refresh endpoint: `POST /api/auth/refresh`
- Logout endpoint: `POST /api/auth/logout`
- Local development fallback credentials: `admin / admin123`
- Production startup refuses the default `APP_PASS` and the development `APP_SECRET`; set both explicitly.
- v2 read endpoints require `read` scope
- v2 write endpoints require `write` scope
- MCP HTTP and SSE endpoints reuse bearer-token auth

## Canonical v2 Envelope

All `/api/v2/*` endpoints respond with:

```json
{
  "requestId": "string",
  "ok": true,
  "data": {},
  "error": null
}
```

Error responses keep the same shape with `ok: false` and a populated `error` object.

## Core v2 Endpoints

- `GET /api/v2/payments`
- `POST /api/v2/payments`
- `GET /api/v2/payments/:id`
- `PATCH /api/v2/payments/:id`
- `POST /api/v2/payments/:id/verify`
- `POST /api/v2/payments/:id/refund`
- `GET /api/v2/refunds`
- `GET /api/v2/reconciliation`
- `GET /api/v2/analytics/refunds`
- `GET /api/v2/analytics/webhook-deliveries`
- `GET/POST/PATCH/DELETE /api/v2/providers`
- `GET/POST/PATCH /api/v2/mismatches`
- `POST /api/v2/webhook` (no auth, signature-verified)
- `GET/POST /api/v2/webhook-traces`
- `GET/POST/PATCH/DELETE /api/v2/webhook-subscriptions`
- `GET /api/v2/webhook-deliveries`
- `GET /api/v2/webhook-dead-letters`
- `POST /api/v2/webhook-dead-letters/:id/requeue`
- `DELETE /api/v2/webhook-dead-letters/:id`
- `GET /api/v2/analytics`
- `GET /api/v2/settlements`

## Auxiliary Endpoints

- `GET /`
- `GET /api/health`
- `GET /api/ready`
- `GET /api/v2/openapi.json`
- `POST /api/ai/risk-score`

## MCP

- Stdio entrypoint: `bun run mcp:start`
- HTTP JSON-RPC: `POST /api/mcp`
- HTTP+SSE session transport:
  - `GET /api/mcp/sse`
  - `POST /api/mcp/messages/:sessionId`
  - `DELETE /api/mcp/sessions/:sessionId`

MCP currently exposes payment, refund, reconciliation, delivery, provider, and webhook subscription tools and resources.

### Canonical Payment Shape

`id, createdAt, amountMinor, currency, providerId, recipientRef, status, replay, providerRef, redirectUrl, providerResponse, refunds[], refundedAmountMinor`

### Idempotency Behavior (`POST /api/v2/payments`)

- New key/hash: `201`
- Replay same key/hash: `200` with `replay: true`
- Same key with different payload hash: `409`

## v1 Compatibility (Deprecated)

- `GET /api/payments`
- `POST /api/payments`

These routes remain available and include:

- `Deprecation: true`
- `Sunset: Tue, 30 Jun 2026 23:59:59 GMT`
- `Link: </api/v2/payments>; rel="successor-version"`

## Storage

- SQLite-first (`node:sqlite`) when available
- JSON fallback (`app/data.json`) when SQLite is unavailable
- `/api/ready` reports active backend (`sqlite` or `json-file`)
- Pending webhook queue jobs persist in state and replay on restart when queue auto-start is enabled
- Exhausted webhook jobs can be inspected and re-queued from the dead-letter store

## Environment

See `.env.example`. Runtime variables:

- `APP_NAME` (default `payconnectoid`)
- `HOST` (default `127.0.0.1`)
- `PORT` (default `4106`)
- `APP_DATA_FILE` (default `app/data.json`)
- `APP_DB_FILE` (default `app/data.sqlite`)
- `APP_USER` (default `admin`)
- `APP_PASS` (development default `admin123`; production startup rejects this default)
- `APP_ROLE` (default `admin`)
- `APP_SECRET` (access and refresh token signing secret; production startup requires a non-default value)
- `AUTH_SALT` (legacy password-hash migration salt)
- `BODY_LIMIT_BYTES` (default `1048576`)
- `CORS_ORIGINS` (comma-separated allowed origins; development defaults to `*`)
- `IDEMPOTENCY_TTL_HOURS` (default `24`)
- `WEBHOOK_SIGNING_SECRET_DEFAULT`
- `WEBHOOK_SIGNING_SECRET_<PROVIDER>`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_BASE_URL`
- `WEBHOOK_RETRY_DELAYS_MS`
- `WEBHOOK_DELIVERY_TIMEOUT_MS`
- `WEBHOOK_QUEUE_AUTO_START`

## Notes

- Amounts are stored and processed as minor units (`amountMinor`).
- Refunds are validated against settled payments and remaining refundable balance.
- Refund and webhook delivery analytics support `window`, `bucket`, `from`, and `to` query parameters.
- The current open-source adapter registry ships one live provider adapter: `paystack`.
- The commercial edition is not present in this workspace; keep proprietary features outside the open-source tree and integrate through clearly documented boundaries.
- Convex files are currently experimental and not wired into runtime request handling in this phase.

## License

Copyright © 2026 Lehro Solutions. Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE).

## Documentation

Canonical docs hub: [`docs/.docs/index.md`](docs/.docs/index.md)

## Package manager (Bun)

This package is **Bun-first**.

```bash
bun install
bun run dev    # if defined
bun run build  # if defined
bun test       # or: bun run test
```

- Lockfile target: `bun.lock` (generate locally with `bun install`)
- `packageManager` field pins Bun via Corepack-compatible tooling ecosystems
- Node remains a compatibility runtime floor; prefer Bun for install/run/test

See docs for the package-manager decision: search for `ADR-0003` in `docs/.docs/` when present.

## How to use

See [docs/how-to-use.md](docs/how-to-use.md) for the full operator guide.

## Security

See [SECURITY.md](SECURITY.md).

<!-- docs-system:start -->

## Documentation

The current public documentation is available in [`docs/index.html`](docs/index.html). Start with [`docs/current/start-here.md`](docs/current/start-here.md) for scope, current changes, workflows, architecture, security, quality, and contribution guidance.

### Latest public changes

- Refund analytics
- Adapter-backed provider operations
- Webhook delivery and dead-letter recovery
- Reconciliation pipeline and AI risk scoring

Documentation is maintained as canonical Markdown plus generated HTML and JSON counterparts. Run `pnpm docs:build` after changing `docs/current/*.md` and `pnpm docs:check` before a public release.
<!-- docs-system:end -->

<!-- bun-toolchain:start -->

## Bun and CI

This repository uses **Bun 1.3.14** and targets **Node 24+** for JavaScript tooling and CI.

```bash
rm -f package-lock.json
bun install
bun run build
bun run test
bun run docs:check
```

Do not use `npm ci`; Bun is the canonical install path. Run `bun install` after dependency changes and commit the resulting `bun.lock`.
<!-- bun-toolchain:end -->

## Production operation

See [PRODUCTION.md](PRODUCTION.md) for verified release checks, configuration, data handling, and recovery.
