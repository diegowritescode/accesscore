# Security Policy

AccessCore is an identity & access management platform — security is the product. We take
vulnerabilities seriously and appreciate responsible disclosure.

## Reporting a vulnerability

Please **do not** open a public issue for security reports. Instead, use GitHub's private
vulnerability reporting ("Report a vulnerability" under the Security tab) or contact the
maintainer directly.

Include, where possible: affected component, a description, reproduction steps or a
proof-of-concept, and impact. We aim to acknowledge reports within 72 hours.

## Supported versions

This project is pre-1.0 and under active development; only the latest `main` is supported.

## Scope & design

The threat model and controls are documented in
[`docs/security.md`](docs/security.md) and the ADRs under [`docs/adr/`](docs/adr/) —
notably the PDP trust model (ADR-008) and key management (ADR-009). Findings that
contradict those documents are especially welcome.
