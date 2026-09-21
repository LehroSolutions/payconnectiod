# payconnectoid - Production Guide

## Deployment Model
- Payment orchestration API service (`app/server.js`)
- Webhook receiver (`POST /api/v2/webhook`)
- Reconciliation summary endpoint (`GET /api/v2/reconciliation`)
- Refund and delivery analytics endpoints for dashboards
- Remote MCP transport endpoints for agent clients

## Required Configuration
- `APP_USER`, `APP_PASS`, `AUTH_SALT`
- `IDEMPOTENCY_TTL_HOURS`
- `WEBHOOK_SIGNING_SECRET_DEFAULT`
- `PAYSTACK_SECRET_KEY` for live Paystack adapter operations
- `PAYSTACK_BASE_URL` for adapter override/testing
- `WEBHOOK_RETRY_DELAYS_MS`
- `WEBHOOK_DELIVERY_TIMEOUT_MS`
- `WEBHOOK_QUEUE_AUTO_START`
- Optional provider secrets: `WEBHOOK_SIGNING_SECRET_<PROVIDER>`

## Runtime Flow
1. Client creates idempotent payment request with `idempotencyKey`.
2. Service validates and stores canonical payment (`amountMinor`).
3. Provider adapters can initialize, verify, and refund against payment records.
4. Status changes are guarded by lifecycle transition rules.
5. Webhooks are verified via HMAC before trusted updates are applied.
6. Outbound webhook jobs are enqueued, persisted, and delivered asynchronously.
7. Reconciliation, refund, and delivery summaries are computed from persisted state.

## Reliability
- v2 envelope contract is consistent across all `/api/v2/*` endpoints.
- Idempotency records are persisted and TTL-pruned.
- v1 compatibility routes are retained with explicit deprecation headers.
- Structured logs include replay/conflict/invalid-transition signals.
- Webhook queue jobs persist in application state and replay after restart.
- HTTP and SSE MCP clients can use the same authenticated tool surface as stdio clients.

## Storage
- Primary: SQLite if `node:sqlite` is available.
- Fallback: JSON state file.
- `GET /api/ready` reports active storage backend.
- Persisted runtime state also includes webhook subscriptions, deliveries, and pending queue jobs.
