# Skill: Operator Access And Session Hygiene

## Use This For

- Browser dashboard login.
- Automation scripts that call `/api/v2/*` routes.
- Remote MCP clients using HTTP or SSE.
- Any workflow that needs bearer-token handling, refresh, or logout.

## Primary Surface

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- Authenticated `/api/v2/*` routes
- Authenticated `/api/mcp*` routes

## Execution Protocol

1. Authenticate with `username` and `password`.
2. Store `accessToken` and `refreshToken` separately.
3. Send `Authorization: Bearer <token>` on every protected request.
4. Include `x-request-id` on operator scripts and admin tooling for traceability.
5. Refresh long-lived sessions instead of forcing repeat login loops.
6. On logout, invalidate the current access token and the refresh token the client still holds.

## Best Practices

- Replace the default auth credentials before any public or shared deployment.
- Treat the browser dashboard token in `localStorage` as an operator convenience, not a hardened multi-user session model.
- Use read-only sessions for dashboards whenever the client does not need write operations.
- Reuse the same bearer-token flow for MCP HTTP and SSE clients so scope handling stays consistent.
- Review the auth audit trail in persisted state when diagnosing operator access incidents.

## Failure Modes

- `401` on protected routes usually means missing token, expired token, or wrong scope.
- Refresh fails when the refresh token is missing, expired, or no longer matches stored auth state.
- Logout only clears tokens the server knows about; clients still need to erase local copies.

## Release Gates

- README documents login, refresh, and logout.
- `.env.example` documents `APP_USER`, `APP_PASS`, `APP_ROLE`, and `AUTH_SALT`.
- Manual login and refresh succeed in both browser and script flows.