# AccessCore — Business Context

## What it is

AccessCore is a self-hostable **Identity & Access Management (IAM) platform**: an
OIDC-based authentication provider plus a rigorous, hybrid **authorization decision
engine**. It is the security foundation the rest of this portfolio's systems build on —
every other service delegates authentication and authorization to it.

## The problem

Most applications reinvent auth badly: a `users` table, a login endpoint, JWTs, and a
`role` column checked with `if (user.role === 'admin')`. That collapses under real
requirements:

- **Fine-grained, resource-level** permissions ("can user X post to ledger account Y?")
  that a role enum cannot express.
- **Relationship-based** access ("this document is shared with this team") — not role-based.
- **Conditional** access ("only from a trusted IP", "only with MFA present", "only during
  business hours").
- **Safe delegated administration** in multi-tenant systems (a tenant admin must not be
  able to exceed a ceiling).
- **Auditable, provable, revocable** access — with detection of token theft and
  stale-permission bugs.

AccessCore treats authorization as a first-class engineering problem, drawing on the three
dominant models and unifying them:

- **AWS IAM** — policy/ABAC with deterministic, deny-override evaluation.
- **Google Zanzibar** — relationship-based access control (ReBAC) at scale.
- **AWS Cedar** — a clean, analyzable, formally-verified policy language.

## Who uses it

- **End users** — authenticate (password, MFA, passkeys), manage sessions/devices.
- **Application services** (the spine: MiniLedger, EventBridge, …) — verify tokens and ask
  "is this principal allowed to do this?" through a typed SDK.
- **Tenant / org admins** — manage users, roles, policies, and relationships via a console.
- **Platform operators** — audit access, run access reviews, detect over-privilege.
- **Machines / workloads** — authenticate as service accounts / via workload identity federation.

## Why it matters

- **Security & compliance:** least-privilege, auditable and provable decisions,
  tamper-evident logs; mappable to NIST 800-63, OWASP ASVS, SOC2.
- **Reuse:** one hardened identity layer instead of re-implementing auth per service — the
  concrete expression of this portfolio's "spine."
- **Trust:** correct, provable authorization is the difference between a demo and a system a
  real company would actually run.

## Scope philosophy

Robust does **not** mean "every feature." It means a **correct, deterministic, verifiable,
consistent, observable decision core**, surrounded by capability rings added in value
order. See [scope-and-roadmap.md](scope-and-roadmap.md). Whatever is deferred is deferred
_on purpose_ and recorded in an ADR — scoping is itself a design decision.
