# How to Use PayconnectOID

Payment orchestration core with v2 APIs, webhooks, refunds, analytics, and MCP.

## 1) Install & run

```bash
cp .env.example .env
bun install
bun start
```

Open http://127.0.0.1:4106

## 2) First API session
1. `POST /api/auth/login`
2. Call v2 endpoints with `Authorization: Bearer <token>`
3. Create a payment using an Idempotency-Key
4. Inspect refunds and analytics endpoints

Useful routes:
- `GET /api/health`
- `GET /api/v2/openapi.json`
- `/api/v2/payments`
- `/api/v2/refunds`
- `/api/v2/analytics/*`

## 3) Tests

```bash
bun test
```

## 4) Production requirements
- Strong `APP_PASS` and `APP_SECRET`
- Private webhook signing secrets
- Do not expose the operator console without auth controls

## Related
- [INSTALL.md](../../INSTALL.md)
- [Security](../../SECURITY.md)
- [Architecture](./architecture.md)
