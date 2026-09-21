# AGENTS.md — PayConnectoid

Operating contract for AI coding agents, with human-in-the-loop checkpoints.

## Identity

PayConnectoid is an open-core payment orchestration server: idempotent
payments, provider adapters (PayStack et al.), webhook delivery queueing,
analytics, and MCP access. Node >=24 ESM, runs on **bun**. License:
Apache-2.0 (`COMMERCIAL.md` governs commercial terms — keep them separate).

## Command Reference

| Task                                        | Command                                              |
| ------------------------------------------- | ---------------------------------------------------- |
| Install                                     | `bun install`                                        |
| Run tests                                   | `npm test` (Node-native `node:test` — real Node)     |
| Start server                                | `bun run start` (`app/server.js`)                    |
| Start MCP stdio                             | `bun run mcp:start` (`src/mcp/server.js`)            |
| Generate SDKs                               | `bun run sdk:generate`                               |
| Format / check                              | `bun run format` / `bun run format:check` (prettier) |
| Docs (build/check)                          | `bun run docs:build` / `bun run docs:check`          |
| **Full verify (run before declaring done)** | `npm run verify`                                     |

## Verify Contract

`npm run verify` = prettier format:check + full test suite (unit +
integration) under real Node. Must pass before you report success.

**Runtime note:** tests MUST run under real Node (`npm test`), never
`bun test` — Bun's `node:http` polyfill corrupts mid-stream error responses
(it sends a bare `\r\n` instead of a 413 envelope), producing false
failures in HTTP integration tests. Bun remains the runtime for the server
itself and for prettier. Integration tests use in-memory
providers — they must not require network access or real API keys.

## Codebase Map

- `src/index.js` — library entry; `src/router.js` — HTTP routing
- `src/adapters/` — provider adapters (`interface.js` is the contract;
  `registry.js` resolves adapters)
- `src/idempotency.js`, `src/webhook.js`, `src/events/delivery.js` — core
  payment guarantees (idempotency keys, webhook signing, delivery queue)
- `src/mcp/` — MCP surface (stdio + HTTP routes under `src/routes/mcp.js`)
- `src/routes/` — REST API (v2, legacy, auth, health, docs, risk)
- `tests/` — bun test suite incl. integration + webhook persistence tests
- `openapi.yaml` — published spec (release asset; keep in sync with routes)
- `convex/` — Convex mirror backend

## Conventions

- Plain ESM JavaScript (no TS, no build step for the server itself).
- Every payment mutation must be idempotency-guarded; every webhook payload
  must be signature-verified. New endpoints need both covered by tests.
- Keep `openapi.yaml` in sync with `src/routes/` — release assets ship it.

## Human-in-the-Loop Checkpoints

Ask the human before:

- Any change to idempotency, webhook signing, or auth/token semantics.
- Adding/removing payment providers or changing adapter contract.
- Publishing releases or regenerating published SDKs.

## Danger Zones

- Never commit real provider API keys, webhook secrets, or `.env` files.
- Never point tests at live payment providers — sandbox/mocks only.
- `COMMERCIAL.md` boundaries: commercial features never enter this repo.
