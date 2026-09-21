# Skill: MCP Transports

## Use This For

- Local stdio MCP usage.
- Remote HTTP JSON-RPC MCP usage.
- Remote HTTP plus SSE session usage.
- Tooling that needs payments, refunds, reconciliation, delivery, provider, or webhook-subscription operations through MCP.

## Primary Surface

- `npm run mcp:start`
- `POST /api/mcp`
- `GET /api/mcp/sse`
- `POST /api/mcp/messages/:sessionId`
- `DELETE /api/mcp/sessions/:sessionId`

## Execution Protocol

1. Choose stdio for local trusted tooling and HTTP or SSE for remote clients.
2. Authenticate remote HTTP and SSE requests with the same bearer-token model used by the REST API.
3. For direct HTTP JSON-RPC, expect an immediate JSON response.
4. For SSE, open the session, capture `sessionId`, `postPath`, and `closePath`, then send messages to the provided post path.
5. Expect `202` acknowledgement from the SSE message POST and read the actual JSON-RPC result from the stream.
6. Close SSE sessions explicitly when the client is done.

## Best Practices

- Treat remote MCP as write-capable operator access and protect it accordingly.
- Reuse the canonical REST auth lifecycle rather than inventing a separate MCP auth layer.
- Close abandoned SSE sessions so heartbeat loops do not accumulate.
- Keep client code ready for `404` on message posts after a session is closed.
- Document which MCP tools are safe for dashboards versus which mutate runtime state.

## Failure Modes

- `404` on `/api/mcp/messages/:sessionId` means the session no longer exists.
- Missing bearer auth produces the same kind of authorization failure seen on write-protected REST routes.
- Assuming SSE POST returns the full result is incorrect; it only acknowledges receipt.

## Release Gates

- `tests/mcp.integration.test.js` and `tests/mcp.http.integration.test.js` stay green.
- README documents stdio, HTTP JSON-RPC, and SSE transports together.
- Launch guidance tells remote clients to close SSE sessions explicitly.