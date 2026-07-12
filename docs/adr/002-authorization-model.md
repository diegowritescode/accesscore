# ADR-002: Authorization model — Hybrid ReBAC + RBAC + ABAC decision engine

- **Status:** Accepted (2026-07-11)
- **Date:** 2026-07-11
- **This is the defining decision of AccessCore.**

## Context

Authorization has three dominant schools, each answering a different question:

| School                                  | Exemplar            | Answers                                              |
| --------------------------------------- | ------------------- | ---------------------------------------------------- |
| ReBAC (relationships)                   | Google Zanzibar     | _Is the subject related to the resource?_            |
| ABAC / policy (attributes + conditions) | AWS IAM, Cedar      | _Under what conditions (MFA, IP, time, attributes)?_ |
| RLS (row-level)                         | Supabase / Postgres | _Does the row pass the SQL filter?_                  |

Real systems need all three concerns: relationship-based sharing/hierarchy, conditional
access, and roles. No single model covers them well. We also need the **evaluation rigor**
of AWS IAM (deterministic, deny-override) and the **analyzability** of AWS Cedar.

## Decision

Build a single **Policy Decision Point (PDP)** exposing
`check(principal, action, resource, context) → Decision{effect, reasons[]}`,
`expand(resource, relation)`, and `batchCheck`, backed by a **hybrid model**:

1. **ReBAC core** — relationship tuples `resource#relation@subject`, with namespace
   definitions and userset rewrites (`computed_userset`, `tuple_to_userset`) — a pragmatic
   Zanzibar subset. Handles sharing, ownership, and hierarchy.
2. **RBAC as a special case** — a role is a userset; role membership and role→permission are
   tuples. No separate RBAC engine.
3. **ABAC conditions** — a clean, **Cedar-inspired policy DSL**: `permit`/`forbid` over
   `(principal, action, resource)` with `when { … }` / `unless { … }` conditions evaluated
   against PIP-provided context (e.g. `context.mfaPresent`, `resource.owner == principal`,
   `context.ip in trustedRange`).
4. **Deterministic evaluation (IAM-style):**
   - default **deny**;
   - collect all applicable `permit` and `forbid` rules + relationship grants;
   - an explicit **`forbid` always wins** over any `permit`;
   - the effective decision must also lie within any **permission boundary** (delegation
     ceiling) and any **tenant/org guardrail** (SCP-like);
   - the algorithm is specified, ordered, and covered by **property-based tests** asserting
     invariants (deny-override holds; boundary is never exceeded).
5. **Explainability** — every decision returns and logs its `reasons` (which tuples/policies
   matched, the derivation path). This powers the console's Authorization Playground and the
   access analyzer.

Consistency of relationship reads is addressed separately in
[ADR-004](004-authorization-consistency-model.md).

## Consequences

### Positive

- Expresses relationship sharing, roles, and conditional access in one coherent engine.
- Deterministic and analyzable → simulate/shadow policy changes; prove invariants.
- Explainable decisions → strong audit and a killer visual (the playground).

### Negative / costs

- Significant design and testing effort; the hardest part of the system (by intent — it is
  the differentiator).
- A custom DSL needs a parser/validator and careful documentation.

## Alternatives considered

- **Pure RBAC** — rejected: cannot express resource-level sharing or conditions; this is the
  tutorial-grade model we are explicitly transcending.
- **Pure ReBAC (adopt OpenFGA/SpiceDB as-is)** — rejected as the _primary_ build: excellent
  systems, but embedding a finished product removes the engineering we want to demonstrate,
  and neither covers ABAC conditions natively. We borrow their model, not their binary. (We
  will benchmark our subset against OpenFGA semantics in tests.)
- **Embed Cedar / OPA (Rego)** — considered and partially adopted as _inspiration_: Cedar's
  language and formal-verification stance shape our DSL. We build our own analyzable subset
  to showcase the engineering; an ADR-worthy option is to later swap our evaluator for Cedar.
- **Postgres RLS (the Supabase model)** — rejected as the core: authorization logic trapped
  in SQL policies is hard to test, explain, simulate, and reuse across services. Documented as
  the contrast case.

## Refinements from adversarial review (2026-07-11)

- **Input provenance:** conditions and resource facts follow [ADR-008](008-pdp-trust-model.md)
  — identity from the verified token, environment observed server-side, resource facts from
  tuples; caller-supplied attributes never grant access.
- **Action→relation binding:** each `action` maps to a required relation/userset in the
  namespace config (e.g. `document.read` ⇐ `viewer | editor | owner`). Worked example:
  `check(document:1, document.read, user:a)` succeeds iff a tuple path resolves `user:a` into
  `document:1#viewer` (directly or via an `editor`/`owner` rewrite). This mapping _is_ the
  RBAC-over-ReBAC unification.
- **Evaluation invariants:** `Policy.priority` orders only among same-effect rules and can
  **never** override deny; an explicit `forbid` always wins. A condition that errors **fails
  closed**, and a `forbid` whose condition errors is treated as **matching** (never skipped).
- **DSL safety:** the condition language is **total** (no loops/recursion/unbounded ops); ASTs
  are validated and type-checked at policy-write time (in the PAP), with depth/cost caps and no
  backtracking regex; the evaluator is fuzzed.
- **`expand` scope:** returns the **relationship closure only**; ABAC conditions/forbids further
  _restrict_ it, so the analyzer's "who can access X" is an over-approximation for conditional
  policies (documented as such).
- **Traversal safety:** recursive userset resolution uses `UNION` (dedup), a max depth, and
  cycle detection; `orgId` equality is enforced at **every hop** ([ADR-007](007-tenancy-model.md)).
  `expand`/`batchCheck` require an authorized caller and are cost-bounded per caller.
- **Delegation authority:** org **guardrails** are platform-operator-only (immutable to tenant
  admins); a **permission boundary** is assignable only by an authority strictly above the
  bounded principal; **absence of a boundary for a delegated principal = deny** (empty ceiling),
  not "unlimited". The PAP authorizes its own writes through the PDP, bootstrapped by an initial
  super-admin.
