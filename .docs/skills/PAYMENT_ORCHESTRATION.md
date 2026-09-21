# Skill: Payment Orchestration

## Use This For

- Creating canonical payments.
- Reading payment ledgers and individual payment records.
- Applying lifecycle updates.
- Handling idempotent replay and conflict behavior.
- Operating the deprecated v1 compatibility endpoints safely during migration.

## Primary Surface

- `GET /api/v2/payments`
- `POST /api/v2/payments`
- `GET /api/v2/payments/:paymentId`
- `PATCH /api/v2/payments/:paymentId`
- `GET /api/payments` (deprecated)
- `POST /api/payments` (deprecated)

## Required Inputs

- `idempotencyKey`
- `amountMinor`
- `currency`
- `providerId`
- Optional: `recipientRef`, `providerStatus`, `metadata`

## Execution Protocol

1. Generate an idempotency key before every create call.
2. Send money values as integer minor units in `amountMinor`.
3. Persist the returned `payment.id`, `providerRef`, and `redirectUrl` when present.
4. Use list filters for paging, provider partitioning, recipient search, and date-range review.
5. Advance payment state with provider truth whenever possible: adapter verification or verified webhooks first, manual patch second.
6. Keep v1 traffic on a migration clock because the compatibility routes already emit deprecation headers.

## Best Practices

- Never reuse the same idempotency key with a different payload.
- Treat `replay: true` as a successful cache hit, not as an error.
- Do not send decimal amounts when the route expects `amountMinor`.
- Use `providerStatus` on create only when the upstream source is trustworthy.
- Keep lifecycle semantics explicit: `initiated -> authorized -> settled|failed`.

## Failure Modes

- `409 IDEMPOTENCY_CONFLICT` means the key was reused with a different payload hash.
- `422 INVALID_TRANSITION` means the requested lifecycle move is illegal.
- `404 NOT_FOUND` means the payment ID does not exist in the persisted ledger.

## Release Gates

- `tests/api.integration.test.js`, `tests/idempotency.test.js`, and `tests/lifecycle.test.js` stay green.
- README and OpenAPI document replay and conflict behavior.
- Public consumers know v1 is deprecated and sunsets on `2026-06-30`.