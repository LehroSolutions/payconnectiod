# payconnectoid - Security Guide

## Threat Model
- Replay attacks against payment creation.
- Forged webhook events.
- Credential and signing-secret leakage.

## Implemented Controls
- Idempotency key + payload hash conflict detection (`409` on mismatch).
- Persistent idempotency records with TTL pruning.
- Constant-time HMAC webhook signature verification.
- Lifecycle guard rails block invalid status transitions (`422`).
- Structured auth audit trail for login/refresh/logout events.
- Refund validation blocks unsettled, exhausted, and over-limit refund attempts.
- Authenticated HTTP and SSE MCP transport reuses bearer-token scope checks.

## Operational Security
- Use provider-scoped webhook secrets (`WEBHOOK_SIGNING_SECRET_<PROVIDER>`).
- Rotate `AUTH_SALT` and webhook secrets during incident response.
- Use the v2 envelope `requestId` for traceability across logs.
- Treat v1 routes as deprecated and monitor remaining usage until sunset.
- Treat persisted webhook queue jobs as operationally sensitive because they contain outbound event payloads.
- Scope MCP HTTP access to trusted operators because it exposes write-capable payment tools.

## Compliance Notes
- Amounts stored as minor units to avoid reconciliation drift.
- Do not store PAN/CVV or raw card secrets in payload metadata.
- Keep webhook traces and mismatch records according to local retention rules.
- Review retention rules for webhook deliveries and queued jobs if event payloads contain customer references.
