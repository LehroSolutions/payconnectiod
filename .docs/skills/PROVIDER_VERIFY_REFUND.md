# Skill: Provider Verify And Refund Operations

## Use This For

- Adapter-backed payment verification.
- Adapter-backed refunds.
- Provider registry CRUD.
- Refund ledger and refund analytics review.

## Primary Surface

- `POST /api/v2/payments/:paymentId/verify`
- `POST /api/v2/payments/:paymentId/refund`
- `GET /api/v2/refunds`
- `GET /api/v2/analytics/refunds`
- `GET /api/v2/providers`
- `POST /api/v2/providers`
- `PATCH /api/v2/providers/:providerId`
- `DELETE /api/v2/providers/:providerId`

## Current Runtime Truth

The open-source adapter registry currently ships one live adapter: `paystack`. Other provider IDs can still be stored on payments and used for analytics or UI filtering, but live initiate, verify, and refund flows require an adapter implementation.

## Execution Protocol

1. Create or locate a payment with a provider-backed `providerId`.
2. Ensure the payment has a `providerRef` before verify or refund.
3. Use `/verify` to reconcile the provider's latest truth into the canonical lifecycle.
4. Only refund settled payments, and only for a positive integer `amountMinor` within remaining refundable balance.
5. Use the refund ledger and analytics endpoints to confirm refund state after submission.
6. Soft-delete providers instead of hard-removing historical identifiers from analytics history.

## Best Practices

- Document clearly which provider IDs are adapter-backed and which are orchestration-only.
- Keep provider names aligned with adapter IDs where live integration is expected.
- Set `PAYSTACK_SECRET_KEY` before testing any live `paystack` initiate, verify, or refund path.
- Treat refund operations as balance-constrained: partial refunds are fine, over-refunds are not.
- Do not expose refund tooling to read-only clients.

## Failure Modes

- `404 ADAPTER_NOT_FOUND` means the payment's provider has no registered adapter.
- `409 MISSING_PROVIDER_REF` means the payment cannot be verified or refunded against an upstream record yet.
- `409 PAYMENT_NOT_SETTLED`, `REFUND_EXHAUSTED`, or `REFUND_EXCEEDS_REMAINING` means the refund request violates refund policy.

## Release Gates

- `tests/paystack.adapter.integration.test.js` stays green.
- Launch docs state that `paystack` is the only live adapter included in this repository.
- Refund analytics query parameters are documented for dashboard consumers.