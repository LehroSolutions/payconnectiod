# Release Checklist

## Status Snapshot
- Public repository published at https://github.com/LehroSolutions/payconnectiod.
- Git tag and GitHub release `v0.1.0` published on 2026-04-01.
- GitHub Private Vulnerability Reporting enabled.
- Release assets uploaded for the versioned OpenAPI contract and environment example.

## Product Boundary
- [x] Confirm the open-source repository only contains the open-core server, public docs, and non-proprietary assets.
- [x] Confirm commercial-only features remain outside this repository, as described in [COMMERCIAL.md](COMMERCIAL.md).
- [x] Review public docs for accidental references to private infrastructure, credentials, or customer-specific workflows.

## Legal And Publishing
- [x] Confirm [LICENSE](LICENSE) is the intended license for the open-source release.
- [x] Review [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md) before publishing.
- [x] Set the final public repository URL in [package.json](package.json) once the hosted repo is created.

## Technical Validation
- [x] Run `npm test` and confirm the suite is green.
- [x] Confirm [openapi.yaml](openapi.yaml) matches the current public HTTP surface.
- [x] Confirm [README.md](README.md) matches the current route set, MCP transports, and environment variables.
- [x] Smoke-test `npm start` locally and verify `/api/health`, `/api/ready`, and `/api/v2/openapi.json`.

## Runtime Features To Verify
- [x] Idempotent payment create/replay/conflict behavior.
- [x] Provider-backed verify and refund flows.
- [x] Persisted webhook queue replay across restart.
- [x] Webhook dead-letter listing, requeue, and discard flows.
- [x] MCP transports: stdio, HTTP JSON-RPC, and HTTP+SSE.
- [x] MCP SSE session close endpoint.
- [x] Refund and webhook-delivery analytics with `window`, `bucket`, `from`, and `to` filters.

## Release Notes And Versioning
- [x] Review [CHANGELOG.md](CHANGELOG.md) and finalize the version section.
- [x] Review [RELEASE_NOTES_v0.1.0.md](RELEASE_NOTES_v0.1.0.md) and trim or expand for the first public release.
- [x] Tag the release version after the repository is published.

## Optional But Recommended
- [x] Add repository metadata to [package.json](package.json): `repository`, `homepage`, and `bugs` are set.
- [ ] Add `funding` metadata when a public funding URL exists.
- [x] Add issue and pull request templates under `.github/`.
- [ ] Add example requests or SDK examples for faster external adoption.
