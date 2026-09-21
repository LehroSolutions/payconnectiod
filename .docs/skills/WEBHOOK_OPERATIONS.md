# Skill: Webhook Operations

## Use This For

- Inbound provider webhook handling.
- Webhook signature verification.
- Trace persistence and forensic review.
- Outbound webhook subscriptions, deliveries, dead letters, and replay.

## Primary Surface

- `POST /api/v2/webhook`
- `GET /api/v2/webhook-traces`
- `POST /api/v2/webhook-traces`
- `GET /api/v2/webhook-subscriptions`
- `POST /api/v2/webhook-subscriptions`
- `PATCH /api/v2/webhook-subscriptions/:subscriptionId`
- `DELETE /api/v2/webhook-subscriptions/:subscriptionId`
- `GET /api/v2/webhook-deliveries`
- `GET /api/v2/webhook-dead-letters`
- `POST /api/v2/webhook-dead-letters/:deadLetterId/requeue`
- `DELETE /api/v2/webhook-dead-letters/:deadLetterId`

## Inbound Execution Protocol

1. Read the raw request body before parsing so the signature is verified against the exact payload bytes.
2. Resolve the provider from the payload or header.
3. Load the provider-scoped webhook secret when available, otherwise fall back to the default secret.
4. Verify the signature before applying trusted status changes.
5. Persist a webhook trace even when verification fails.
6. Only update payment state from webhook status when the signature is valid.

## Outbound Execution Protocol

1. Register webhook subscriptions with explicit event names and a secret.
2. Let payment events enqueue outbound deliveries instead of delivering inline from the request thread.
3. Inspect `/webhook-deliveries` for queue state and delivery outcomes.
4. Inspect `/webhook-dead-letters` for exhausted jobs.
5. Requeue dead letters when the downstream receiver is healthy again.
6. Discard dead letters only when the event is confirmed obsolete or unrecoverable.

## Best Practices

- Prefer provider-specific secrets over a single shared default secret.
- Keep `WEBHOOK_QUEUE_AUTO_START=true` unless you are deliberately operating a drained queue.
- Treat dead letters as an operator work queue, not as passive logs.
- Review payload retention because delivery jobs and traces may contain customer references.
- Keep subscription secrets unique per receiver.

## Failure Modes

- `401 INVALID_SIGNATURE` means the event was recorded but not trusted.
- Repeated dead letters usually point to receiver availability, payload contract drift, or secret mismatch.
- A disabled subscription still exists in state; it is not hard-deleted.

## Release Gates

- `tests/webhook.test.js`, `tests/webhook-subscriptions.integration.test.js`, and `tests/webhook-queue.persistence.test.js` stay green.
- Production docs call out provider-specific secrets, queue retry timing, and payload sensitivity.
- Operators have a clear requeue and discard procedure before launch.