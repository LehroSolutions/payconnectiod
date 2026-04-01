# Release Checklist

## Product Boundary
- Confirm the open-source repository only contains the open-core server, public docs, and non-proprietary assets.
- Confirm commercial-only features remain outside this repository, as described in [COMMERCIAL.md](COMMERCIAL.md).
- Review public docs for accidental references to private infrastructure, credentials, or customer-specific workflows.

## Legal And Publishing
- Confirm [LICENSE](LICENSE) is the intended license for the open-source release.
- Review [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md) before publishing.
- Set the final public repository URL in [package.json](package.json) once the hosted repo is created.

## Technical Validation
- Run `npm test` and confirm the suite is green.
- Confirm [openapi.yaml](openapi.yaml) matches the current public HTTP surface.
- Confirm [README.md](README.md) matches the current route set, MCP transports, and environment variables.
- Smoke-test `npm start` locally and verify `/api/health`, `/api/ready`, and `/api/v2/openapi.json`.

## Runtime Features To Verify
- Idempotent payment create/replay/conflict behavior.
- Provider-backed verify and refund flows.
- Persisted webhook queue replay across restart.
- Webhook dead-letter listing, requeue, and discard flows.
- MCP transports: stdio, HTTP JSON-RPC, and HTTP+SSE.
- MCP SSE session close endpoint.
- Refund and webhook-delivery analytics with `window`, `bucket`, `from`, and `to` filters.

## Release Notes And Versioning
- Review [CHANGELOG.md](CHANGELOG.md) and finalize the version section.
- Review [RELEASE_NOTES_v0.1.0.md](RELEASE_NOTES_v0.1.0.md) and trim or expand for the first public release.
- Tag the release version after the repository is published.

## Optional But Recommended
- Add repository metadata to [package.json](package.json): `repository`, `homepage`, `bugs`, and `funding`.
- Add issue and pull request templates under `.github/`.
- Add example requests or SDK examples for faster external adoption.
