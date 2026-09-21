# payconnectoid - Build Guide (Current State)

## Purpose
Track the implemented orchestration surface and the current quality bar for releases.

## Implemented Build Scope
- Canonical `/api/v2/*` response envelope.
- Shared payment creation flow for v1 and v2.
- Persistent idempotency records (`state.idempotencyRecords[]`) with TTL.
- Lifecycle transition enforcement during create/update/webhook processing.
- Webhook verification endpoint with trace persistence.
- Provider-backed payment verification and refund flow.
- Refund ledger, validation rules, and refund analytics.
- Outbound webhook subscriptions, delivery persistence, and queue replay.
- MCP surface over stdio and remote HTTP transports.
- Minor-unit amount model (`amountMinor` integers).
- Unit + integration + frontend smoke tests.

## Canonical Contracts
- v2 envelope: `{ requestId, ok, data, error }`
- payment model: `id, createdAt, amountMinor, currency, providerId, recipientRef, status, replay, providerRef, redirectUrl, providerResponse, refunds[], refundedAmountMinor`
- reconciliation model:
  - `summary.totalCount`
  - `summary.matchedCount`
  - `summary.pendingCount`
  - `summary.mismatchCount`
  - `summary.totalVolumeMinor`
  - `byStatus`
- refund analytics model:
  - `range`
  - `summary.refundCount`
  - `summary.totalRefundedMinor`
  - `summary.pendingRefundedMinor`
  - `byProvider`
  - `byCurrency`
  - `byStatus`
  - `timeseries[]`
- delivery analytics model:
  - `range`
  - `summary.deliveryCount`
  - `summary.deliveredCount`
  - `summary.failedCount`
  - `summary.successRate`
  - `byStatus`
  - `byEvent`
  - `timeseries[]`

## Compatibility
- v1 `/api/payments` remains as compatibility wrapper.
- v1 responses include deprecation headers with sunset date `June 30, 2026`.

## Quality Gates
- Deterministic idempotency outcomes (`201` create, `200` replay, `409` conflict).
- Invalid lifecycle transitions rejected with `422`.
- Webhook signatures verified before trusted transition updates.
- Refunds rejected when payment is not settled, refund amount exceeds remaining balance, or refundable balance is exhausted.
- Webhook queue jobs survive restart and replay cleanly.
- MCP core, HTTP+SSE transport, and queue-backed webhook delivery are covered by `npm test`.
- Test suite currently passes at `23/23`.
- `npm start` smoke-check confirms `/api/health`, `/api/ready`, and `/api/v2/openapi.json`.
