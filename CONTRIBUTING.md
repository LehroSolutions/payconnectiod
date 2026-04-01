# Contributing

## Scope
This repository contains the open-source core of payconnectoid.
Commercial-only features, customer-specific integrations, and private operating workflows should not be contributed here unless they are explicitly intended for the open-source core.

## Repository Status
- Public repository: https://github.com/LehroSolutions/payconnectiod
- Current public release: `v0.1.0`
- Issue and pull request templates are available in `.github/`.

## Development
- Use Node.js 20 or newer.
- Install dependencies with `npm install`.
- Run the test suite with `npm test` before opening a pull request.
- Keep changes focused and avoid mixing unrelated refactors with feature work.

## Pull Requests
- Describe the problem and the behavioral change clearly.
- Update docs or OpenAPI when public behavior changes.
- Update [CHANGELOG.md](CHANGELOG.md) and release-facing notes when a change materially affects the published surface.
- Add or update tests for new routes, lifecycle behavior, queue behavior, or MCP functionality.
- Preserve the open-core boundary: do not add proprietary product logic or credentials.
- Use the GitHub issue and pull request templates where they apply.

## Code Guidelines
- Use existing patterns in `src/routes`, `src/events`, and `src/mcp`.
- Keep payment state transitions explicit and validated.
- Keep amounts in minor units.
- Queue outbound webhook work instead of performing it inline in request handlers.

## Security Reporting
Do not open public issues for suspected vulnerabilities.
Follow the process in `SECURITY.md`.
