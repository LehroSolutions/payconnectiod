# payconnectoid Release Gap Audit

Audit date: `2026-03-29`

## Verified Now

| Item | Status | Evidence |
|------|--------|----------|
| Test suite green | done | `npm test` passes at `23/23` |
| Health endpoint | done | `/api/health` returned `ok: true` |
| Readiness endpoint | done | `/api/ready` returned `ok: true` with `storage: sqlite` |
| Served OpenAPI route | done | `/api/v2/openapi.json` returned `openapi: 3.1.0` |
| Idempotency create/replay/conflict | done | Covered in `tests/api.integration.test.js` |
| Provider verify and refund | done | Covered in `tests/paystack.adapter.integration.test.js` |
| Persisted webhook queue replay | done | Covered in `tests/webhook-queue.persistence.test.js` |
| Dead-letter requeue and discard path | done | Covered in `tests/webhook-subscriptions.integration.test.js` |
| MCP HTTP and SSE | done | Covered in `tests/mcp.http.integration.test.js` |
| Risk scoring route live | done | Covered in `tests/api.integration.test.js` and `tests/http.integration.test.js` |

## Missing Or Needs Action Before Release

| Item | Why It Matters | Action |
|------|----------------|--------|
| `mcp_test.js` is machine-specific but still runs under `npm test` | The file hardcodes a Windows user-profile path to a local VS Code extension binary. It passed in this workspace, but it is not portable for CI or outside contributors. | Exclude it from the public test suite or replace it with a repo-local MCP integration test before release. |
| Final public repository metadata in `package.json` | The checklist explicitly calls for the public repository URL. `repository`, `homepage`, `bugs`, and `funding` are still absent. | Add final metadata after the public repo is created. |
| `package.json` still has `"private": true` | This is fine for a GitHub-only release, but it blocks npm publishing if package publication is intended. | Decide whether this repo ships as source only or as a published package. |
| Issue and PR templates are missing | The checklist marks this as optional but recommended for first-wave public contributors. | Add `.github/ISSUE_TEMPLATE/*` and `.github/pull_request_template.md` if community traffic is expected on day one. |
| README drift against current runtime | The README had stale test count and incomplete auth and environment coverage. | Updated in this pass, but review once more after any last-minute API changes. |
| `openapi.yaml` drift against current runtime | The YAML spec was missing parts of the public surface compared with the served OpenAPI document and route implementation. | Updated in this pass. Re-run SDK generation if external SDKs depend on the YAML file. |

## Manual Confirmation Still Required

| Item | Notes |
|------|-------|
| Product boundary review | No obvious proprietary code was surfaced in the inspected files, but a final human scrub is still required for private workflows, customer references, and infrastructure details. |
| Legal review | `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md` exist, but final legal sign-off is a human step. |
| Release notes quality | `CHANGELOG.md` and `RELEASE_NOTES_v0.1.0.md` still need product-owner review for tone, scope, and omissions. |
| Provider support messaging | The UI and docs expose multiple provider IDs, but only `paystack` currently has a live adapter in the open-source tree. Make sure launch messaging is explicit about that. |
| Operational secrets | Replace example auth defaults and confirm production webhook secrets, adapter secrets, and salt values are not using defaults. |

## Highest-Risk Misread To Avoid

The open-source runtime supports multiple provider identifiers at the orchestration layer, but only `paystack` currently implements live adapter initiation, verification, and refund behavior. Treat the other provider names as orchestration labels unless adapter code is added.