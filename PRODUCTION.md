# Production operation

Use Bun 1.3.14 for the lockfile and Node 24 for verification. Run
`bun install --frozen-lockfile`, `npm run verify`, and `bun run docs:check` before
release. There is no server build/transpile step. Tests use synthetic providers
and local HTTP servers; they never charge live accounts.

The container now uses Node 24 and runs `node app/server.js` as an unprivileged
user. Build with `docker build -t payconnectoid:local .`. Mount a protected writable
volume at `/data`; set `NODE_ENV=production`, explicit `APP_PASS` and `APP_SECRET`,
and the provider credentials through the service secret manager. The image does
not contain `.env`, runtime JSON, SQLite files, or logs. The repository's Bun
`start` command dispatches real Node; production Node also supports
the preferred SQLite backend.

## Payment and refund guarantees

Use one process per state file. JSON writes are queued, fsynced and atomically
renamed. SQLite state writes are transactional. Startup refuses corrupt or
unreadable storage instead of silently creating an empty ledger. Protect state
files and backups with filesystem ACLs: they contain payment data and tokens.

A payment's idempotency reservation is saved **before** its external provider
call. Concurrent uses of the same key receive 409. Unfinished reservations do not
expire automatically because a timeout does not prove a payment failed. The
reservation stores the generated `paymentId`, also used as the Paystack reference.

Refund requests require `idempotencyKey` (1–200 characters), including the
`refund_payment` MCP tool. `amountMinor` must be a positive integer; omitted amount
means the original full payment amount. Repeating a completed key and amount
returns the original refund. A different amount with the same key returns 409.
The refundable balance is reserved and persisted before calling the provider, so
concurrent requests cannot exceed the payment amount.

If a refund call times out or fails after dispatch, the operation is recorded as
`unknown` and its amount remains reserved. The response is 502; retries return 409. **Do not use a new key to bypass this state.** Reconcile the payment/refund
against the provider dashboard/API, preserve the evidence, stop the service and
back up its state before an operator repairs the affected record. An operator
must confirm failure before releasing a reserved amount. No automated repair or
live reconciliation is attempted. Paystack HTTP requests have a 15-second timeout.

These guarantees cover one local writer. Multi-process orchestration requires a
shared transactional store and provider-specific reconciliation before release.

## Environment and release checks

`.env.example` documents the available names without production values. The
application reads process environment, not a `.env` file automatically. Essential
variables are `HOST`, `PORT`, `NODE_ENV`, `APP_USER`, `APP_PASS`, `APP_ROLE`,
`APP_SECRET`, `AUTH_SALT`, `APP_DATA_FILE`, `APP_DB_FILE`, `PAYSTACK_SECRET_KEY`,
`PAYSTACK_BASE_URL`, and webhook settings. In production keep private webhook
targets disabled; configure exact CORS origins and TLS at the ingress.

The registry, REST OpenAPI and MCP refund schema share the required idempotency
contract. Sandbox-test initialize → verify → signed inbound webhook → outbound
delivery → refund → replay before connecting a live provider. Exercise a provider
timeout and inspect the retained reservation. Real provider credentials, webhook
domain ownership, TLS and sandbox account access are host-specific release gates.

## Backup and rollback

Stop the process and copy the configured state/database files before upgrading.
Keep access-controlled, versioned backups and the associated application revision.
To recover, preserve failed files, restore a verified compatible backup, start one
writer, then check health/readiness, login, a known ledger record and pending
webhook deliveries. Never delete an uncertain payment reservation as a shortcut.
Roll back compatible code and state together, and reconcile provider activity
that occurred after the backup before accepting further writes.
