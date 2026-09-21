# Skill: Frontend And Risk Console

## Use This For

- Operating the root dashboard served from `/`.
- Logging in through the browser console UI.
- Creating payments through the browser form.
- Reading reconciliation and ledger summaries.
- Running AI risk scoring through `/api/ai/risk-score`.

## Primary Surface

- `GET /`
- `POST /api/auth/login`
- `GET /api/v2/payments`
- `POST /api/v2/payments`
- `GET /api/v2/reconciliation`
- `POST /api/ai/risk-score`

## Execution Protocol

1. Authenticate through the browser form and persist the returned bearer token.
2. Pull the dashboard after login so reconciliation and ledger data stay aligned with server state.
3. Create payments using a fresh UI-generated idempotency key for every submission.
4. Use the risk console as an operator advisory tool, not as the payment system of record.
5. Keep provider IDs entered in the UI aligned with the actual orchestration and adapter surface.

## Best Practices

- Do not treat a risk score as an authorization, settlement, or refund decision by itself.
- Keep the frontend risk palette aligned with the backend risk levels: `low`, `medium`, `high`, and `critical`.
- Treat `localStorage` tokens as sensitive on shared machines.
- Keep the UI copy honest about what requires authentication and what does not.
- Re-run the dashboard after mutations so operators see replay and reconciliation effects immediately.

## Failure Modes

- A missing token leaves the dashboard in its unauthenticated empty state.
- A network failure from the browser currently surfaces as a toast-level anomaly, not a structured retry flow.
- If the UI and backend disagree on risk levels, the operator can misread severity. This file assumes the UI correctly distinguishes `critical` from low-risk results.

## Release Gates

- `tests/frontend.smoke.test.js` stays green.
- The root page loads and the auth form works against the shipped server.
- `critical` risk results are visually distinct from `low` risk results in the browser UI.