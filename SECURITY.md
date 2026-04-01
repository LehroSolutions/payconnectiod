# Security Policy

## Supported Scope
The open-source repository covers the payconnectoid core server, adapters, webhook processing, analytics endpoints, and MCP surfaces that are present in this workspace.

## Reporting A Vulnerability
Do not disclose vulnerabilities publicly in issues or pull requests.

For the public GitHub repository, use GitHub Private Vulnerability Reporting or a repository security advisory.
If that private reporting flow is not enabled yet, enable it before publishing the repository and do not accept vulnerability reports through public issues.

Include:
- A clear description of the issue
- Affected routes, files, or components
- Reproduction steps or proof of concept
- Impact assessment

## Operational Notes
- Rotate bearer-token secrets and webhook signing secrets after any confirmed incident.
- Treat queued webhook payloads, webhook deliveries, and dead-letter records as operationally sensitive.
- Review any open-core versus commercial split carefully before disclosing internal-only behavior.
