# Security policy

## Reporting a vulnerability

Email **hunta@agentmail.to** with the details. Please do not open a public issue for security reports.

We acknowledge within 72 hours, will not pursue good-faith researchers acting in line with this policy,
and will credit fixes if you would like credit.

## Scope

This repo is the client integration surface. The hosted memory service runs at `mcp.hunta.ai`. The
plugin is fail-open and content-free at the breadcrumb level (it never uploads your transcript); the
one place prompt text travels is the recall query, and only to the `GATHER_URL` you configure.

Tenant isolation is enforced server-side from the token's `tid` claim and is independently verifiable:
run `verify_isolation` for an Ed25519-signed attestation of the tenancy boundary.
