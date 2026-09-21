# Release Notes: v0.1.0

Published: 2026-04-01
Repository: https://github.com/LehroSolutions/payconnectiod
Release page: https://github.com/LehroSolutions/payconnectiod/releases/tag/v0.1.0

## Overview

payconnectoid `v0.1.0` is the first public open-core release of the payment orchestration server.

This release publishes the core runtime needed to:

- create idempotent payments,
- enforce lifecycle transitions,
- verify and refund through provider adapters,
- receive and validate provider webhooks,
- deliver outbound webhook events through a persisted queue,
- inspect refund and delivery analytics, and
- access the platform through both HTTP and MCP interfaces.

Production deployments now require an explicit non-default `APP_PASS` and `APP_SECRET` at startup.

## Release Assets

- `payconnectoid-v0.1.0-openapi.yaml`
- `payconnectoid-v0.1.0.env.example`

## Highlights

### Payment Core

- Canonical `/api/v2/*` response envelope.
- Idempotent payment creation with persisted idempotency records.
- Lifecycle transition enforcement for `initiated`, `authorized`, `settled`, and `failed`.
- Provider-backed payment verification and refund flow.

### Webhooks And Delivery

- HMAC webhook verification and webhook trace persistence.
- Outbound webhook subscriptions and delivery audit records.
- Persisted outbound webhook queue replay across process restarts.
- Dead-letter handling with operator requeue and discard endpoints.

### Analytics

- Reconciliation summary endpoints.
- Refund analytics with time-window and bucketed time series.
- Webhook delivery analytics with event and status breakdowns.

### MCP

- Shared MCP core for tools, resources, and prompts.
- Stdio MCP transport.
- Remote MCP over HTTP JSON-RPC.
- Remote MCP over HTTP+SSE, including explicit session close support.

## Public Surface In This Release

- Payment APIs under `/api/v2/payments`.
- Refund APIs under `/api/v2/refunds`.
- Webhook operations under `/api/v2/webhook*`.
- Analytics endpoints under `/api/v2/analytics*`.
- MCP endpoints under `/api/mcp`, `/api/mcp/sse`, and `/api/mcp/messages/:sessionId`.

## Open-Core Boundary

This repository contains the open-source core only.
Commercial-only features, private customer integrations, and internal operating workflows are intentionally excluded from this release.

See [COMMERCIAL.md](COMMERCIAL.md) for the open-core boundary.

## Validation

- Automated validation: `npm test` passed for the published release.
- Runtime smoke: `npm start` served `/api/health`, `/api/ready`, and `/api/v2/openapi.json` before publication.
- Repository security: GitHub Private Vulnerability Reporting is enabled.
