# Security Policy

## Supported Scope

The open-source repository covers the payconnectoid core server, adapters, webhook processing, analytics endpoints, and MCP surfaces that are present in this workspace.

## Reporting A Vulnerability

Do not disclose vulnerabilities publicly in issues or pull requests.

For the public GitHub repository, use GitHub Private Vulnerability Reporting in the repository security tab:

- https://github.com/LehroSolutions/payconnectoid/security

Private vulnerability reporting is enabled for this repository. Do not use the public issue tracker for security disclosures.

Include:

- A clear description of the issue
- Affected routes, files, or components
- Reproduction steps or proof of concept
- Impact assessment

## Operational Notes

- Rotate bearer-token secrets and webhook signing secrets after any confirmed incident.
- Treat queued webhook payloads, webhook deliveries, and dead-letter records as operationally sensitive.
- Review any open-core versus commercial split carefully before disclosing internal-only behavior.

## Outbound Delivery Protection (SSRF)

Outbound webhook delivery URLs are attacker-reachable, because any caller holding
`write` scope can register a subscription. `src/net/url-guard.js` therefore rejects a
subscription URL when it:

- uses a protocol other than `http` or `https` (blocks `file:`, `gopher:`, `data:`, ...)
- embeds credentials in the authority (`https://user:pass@host/`)
- resolves — via DNS, not just the literal host — to a loopback, private, link-local,
  carrier-grade NAT, multicast, or otherwise reserved address, including the cloud
  metadata endpoint `169.254.169.254`

Deliveries use `redirect: 'manual'`, so a permitted public URL cannot bounce the server
onto an internal address. The guard runs on subscription create, on update, and again at
delivery time.

The check is **enabled in production and disabled outside it**, so local development and
test harnesses can still deliver to `127.0.0.1`. Set `WEBHOOK_ALLOW_PRIVATE_TARGETS=true`
to permit private targets explicitly.

## Known Limitations

These are recorded rather than silently changed, because altering them alters payment,
idempotency, webhook-signing, or auth semantics and needs explicit sign-off:

- **Idempotency in-flight window.** A key that is `reserved` but not yet `completed` is
  accepted again rather than rejected, so two concurrent requests sharing a key can both
  reach provider initiation. The second write overwrites the first key's stored result.
- **Key left reserved on rejection.** A create that fails validation or lifecycle
  transition (HTTP 422) leaves its idempotency key `reserved` until TTL expiry, so a
  corrected retry with the same key conflicts.
- **Unbounded in-memory state.** `ledger`, `idempotencyRecords`, `webhookTraces`,
  `webhookDeliveries`, `webhookDeadLetters`, and the auth audit log grow without limit.
  This is a slow memory-exhaustion and state-file-growth risk on a long-lived process.
- **Provider chosen before verification.** Incoming webhooks read `provider` from the
  untrusted request body to select the signing secret, falling back to a single
  `WEBHOOK_SIGNING_SECRET_DEFAULT`. With that default set, one shared secret verifies any
  provider name.
- **Weak legacy password hashes.** Accounts still on the SHA-256 `salt:password` scheme
  remain crackable until their next successful login. `AUTH_SALT` defaults to a constant
  published in this repository, so those hashes are trivially attacked until migrated.
- **Default credentials.** `APP_USER=admin` / `APP_PASS=admin123` with `APP_ROLE=admin`
  apply unless overridden. Production start-up refuses these via
  `validateProductionConfig`, but any non-production deployment is publicly guessable.
- **No login rate limiting.** `/api/auth/login` has no throttling or lockout, so
  credentials are brute-forceable. Response timing is now equalized for unknown users, so
  the endpoint no longer enumerates usernames.
- **Signing secrets are returned in API responses.** Subscription objects include their
  `secret` field on create and on list, exposing them to every `read`-scoped caller.
- **DNS rebinding.** The guard resolves and validates, then `fetch` resolves again. A
  rebinding attack could still swap the address between the two lookups.
- **`/api/ai/risk-score` is unauthenticated.** It declares no `authScope` and validates
  only the amount.
