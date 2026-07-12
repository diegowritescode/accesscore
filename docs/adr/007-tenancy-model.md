# ADR-007: Tenancy model — global identity with per-organization membership

- **Status:** Accepted (2026-07-11)
- **Date:** 2026-07-11

## Context

The initial data model encoded tenancy twice (`User.orgId` _and_ `Membership`) — a
foundational ambiguity flagged in adversarial review. The platform targets B2B SaaS with SSO
and SCIM (Ring 2), where one human legitimately belongs to multiple organizations.

## Decision

Adopt **global identity + per-organization membership**.

- A `User` is a **global identity** (one human = one `User`); there is **no `orgId` on
  `User`**.
- **Email uniqueness is global** (identity is global), not per-org. Credentials (password
  hash, MFA enrollments) belong to the global `User`.
- `Membership(userId, orgId, status, joinedAt)` is the org roster. Roles, relationship
  tuples, policies, guardrails, and audit are **org-scoped** and reference membership.
- The **active organization** for a request is derived from the verified access token
  (`org` claim) / session — never from a caller-supplied field (see
  [ADR-008](008-pdp-trust-model.md)).
- The PDP evaluates one org per `check()` and **enforces `orgId` equality at every graph
  hop** of userset traversal (no cross-tenant resolution).

## Consequences

### Positive

- Supports SSO / SCIM and multi-org humans; clean separation of identity vs tenancy.
- One credential set per human — no duplicate accounts across orgs.

### Negative / costs

- Cross-org isolation must be enforced explicitly in every query and graph traversal; a
  compromised org context must never leak across orgs (covered by tuple org-scoping + tests).
- "Which org am I acting in" becomes a first-class concept carried in tokens/sessions.

## Alternatives considered

- **Single-org user** — rejected: cannot model the same human across organizations and breaks
  under B2B SSO; `Membership` would be redundant.
