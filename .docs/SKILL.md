# payconnectoid Skill Index

This folder treats a skill as a release-facing operating playbook: one workflow, one set of best practices, one verification bar.

## Verified Release Baseline

- `npm test` passes at `23/23` as of `2026-03-29`.
- `npm start` smoke-check confirmed `/api/health`, `/api/ready`, and `/api/v2/openapi.json`.
- The shipped surface includes auth, canonical v2 payments, refunds, provider management, webhook delivery, analytics, MCP transports, the root dashboard, and AI risk scoring.

## Workflow Skills

- [skills/OPERATOR_ACCESS.md](skills/OPERATOR_ACCESS.md)
- [skills/PAYMENT_ORCHESTRATION.md](skills/PAYMENT_ORCHESTRATION.md)
- [skills/PROVIDER_VERIFY_REFUND.md](skills/PROVIDER_VERIFY_REFUND.md)
- [skills/RECONCILIATION_ANALYTICS.md](skills/RECONCILIATION_ANALYTICS.md)
- [skills/WEBHOOK_OPERATIONS.md](skills/WEBHOOK_OPERATIONS.md)
- [skills/MCP_TRANSPORTS.md](skills/MCP_TRANSPORTS.md)
- [skills/FRONTEND_RISK_CONSOLE.md](skills/FRONTEND_RISK_CONSOLE.md)

## Release Truths Every Skill Assumes

- All `/api/v2/*` routes use the canonical `{ requestId, ok, data, error }` envelope.
- Payment amounts are stored and processed as integer minor units in `amountMinor`.
- Idempotency is mandatory for payment creation.
- Only `paystack` is adapter-backed in the current open-source tree. Other provider IDs can be stored and queried, but live initiate, verify, and refund flows require an adapter implementation.
- Outbound webhooks are queued and persisted instead of being delivered inline from request handlers.
- Remote MCP over HTTP and SSE reuses bearer-token auth and exposes write-capable operations.

## Companion Docs

- [BUILD.md](BUILD.md)
- [PRODUCTION.md](PRODUCTION.md)
- [SECURITY.md](SECURITY.md)
- [RELEASE_GAP_AUDIT.md](RELEASE_GAP_AUDIT.md)
