# Open-Core And Commercial Boundary

This repository is the open-source core of payconnectoid.

## Public Repository Status

- Public repository: https://github.com/LehroSolutions/payconnectiod
- First public GitHub release: `v0.1.0`
- GitHub Private Vulnerability Reporting is enabled on the public repository.

## Included Here

- Canonical payment orchestration API
- Provider adapters and verification/refund flow
- Idempotency, lifecycle enforcement, webhook verification
- Outbound webhook queueing, dead-letter handling, and analytics
- MCP core plus stdio and remote HTTP transports
- OpenAPI contract and public documentation

## Excluded From This Repository

- Paid-only modules
- Customer-specific integrations or credentials
- Hosted-service operational tooling that is not intended for open-source distribution
- Internal admin UX or support workflows that are part of the commercial product

## Release Guidance

- Keep proprietary code in a separate private repository or private workspace folder.
- Integrate commercial features through clear extension points instead of mixing them into the open-source core.
- Document public extension boundaries so the commercial edition can build on the core without forking behavior unnecessarily.

## Current Workspace Note

No private commercial folder is present in this workspace snapshot.
If you maintain one elsewhere, keep the separation explicit and avoid committing proprietary assets into this repository.
