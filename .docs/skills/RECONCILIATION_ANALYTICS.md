# Skill: Reconciliation, Refund, And Delivery Analytics

## Use This For

- Payment reconciliation summaries.
- Mismatch triage.
- Settlement review.
- Refund analytics dashboards.
- Webhook delivery analytics dashboards.

## Primary Surface

- `GET /api/v2/reconciliation`
- `GET /api/v2/analytics`
- `GET /api/v2/settlements`
- `GET /api/v2/mismatches`
- `POST /api/v2/mismatches`
- `PATCH /api/v2/mismatches/:mismatchId`
- `GET /api/v2/refunds`
- `GET /api/v2/analytics/refunds`
- `GET /api/v2/analytics/webhook-deliveries`

## Execution Protocol

1. Use reconciliation for the current operational snapshot.
2. Use settlements for the settled-only ledger slice.
3. Create mismatches when bank or downstream truth disagrees with canonical payment state.
4. Patch mismatches as triage advances or resolution is established.
5. Use `window`, `bucket`, `from`, and `to` consistently on refund and delivery analytics so dashboards are comparable across refreshes.
6. Partition analytics by `providerId`, `currency`, `status`, `event`, or `subscriptionId` rather than recomputing this client-side when the API already supports it.

## Best Practices

- Keep all monetary reporting in minor units until the presentation layer formats it.
- Treat `matchedCount` as `settled minus mismatches`, not as a synonym for total settlements.
- Use explicit date windows on dashboards so operators know what the timeseries covers.
- Keep mismatch reasons operator-readable; they become the audit trail for manual triage.
- Align refund and delivery dashboard buckets with the reporting cadence the team actually uses.

## Failure Modes

- Empty timeseries often means the requested range excludes the underlying events.
- A high mismatch count does not necessarily mean failed payments; it means unresolved reconciliation disagreement.
- Delivery success rate can look deceptively healthy if filters exclude failed subscriptions or event types.

## Release Gates

- README and OpenAPI document the analytics query parameters.
- Dashboard consumers know that analytics endpoints are time-windowed, not lifetime-only.
- Reconciliation and mismatch routes remain aligned with the public docs after any last-minute schema changes.