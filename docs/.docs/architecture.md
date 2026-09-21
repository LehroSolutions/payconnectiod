# PayconnectOID Architecture

  ## Intent
  Provider-agnostic payments core with v2 APIs, refunds, webhooks, MCP tools, and operator shell.

  ## Runtime shape
  - Domain: **Payments infrastructure**
  - Primary stack: Node.js, vanilla HTTP app, adapter pattern, optional Convex scaffolds
  - Key entrypoints:
- `app/server.js`
- `app/index.html`
- `src/routes/v2.js`
- `src/auth/tokens.js`

  ## Boundaries
  - Validate inputs at trust boundaries.
  - Keep authorization explicit near data access.
  - Prefer recoverable errors over silent failure.
  - Keep side effects isolated and observable.

  ## Related
  - [Design System](./design-system.md)
  - [Security](./security.md)
  - [ADR-0001](./adr-0001-docs-system.md)
  - [Roadmap](./roadmap.md)
