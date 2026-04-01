# Contributing

## Scope
This repository contains the open-source core of payconnectoid.
Commercial-only features, customer-specific integrations, and private operating workflows should not be contributed here unless they are explicitly intended for the open-source core.

## Development
- Use Node.js 20 or newer.
- Install dependencies with `npm install`.
- Run the test suite with `npm test` before opening a pull request.
- Keep changes focused and avoid mixing unrelated refactors with feature work.

## Pull Requests
- Describe the problem and the behavioral change clearly.
- Update docs or OpenAPI when public behavior changes.
- Add or update tests for new routes, lifecycle behavior, queue behavior, or MCP functionality.
- Preserve the open-core boundary: do not add proprietary product logic or credentials.

## Code Guidelines
- Use existing patterns in `src/routes`, `src/events`, and `src/mcp`.
- Keep payment state transitions explicit and validated.
- Keep amounts in minor units.
- Queue outbound webhook work instead of performing it inline in request handlers.

## Security Reporting
Do not open public issues for suspected vulnerabilities.
Follow the process in `SECURITY.md`.
