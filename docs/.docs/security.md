# PayconnectOID Security

## Current controls
- CSP/security headers
- Session-only browser tokens
- Idempotency keys + webhook signature verification
- Production rejects insecure auth defaults

## Logging convention
Security issues noticed during failed builds or breaking errors should be recorded under this docs system as dated markdown notes and linked from this page.

## Related logs
- Prefer `SECURITY_ISSUES_YYYY-MM-DD.md` siblings in this folder when incidents occur
- Keep secrets out of documentation samples

## Related
- [Architecture](./architecture.md)
- [License](./license.md)
- [ADR-0002](./adr-0002-apache-2-0.md)
