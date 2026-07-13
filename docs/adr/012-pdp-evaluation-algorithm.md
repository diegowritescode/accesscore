# ADR-012: PDP evaluation algorithm — the v1 ReBAC decision function

- **Status:** Accepted (2026-07-12)
- **Date:** 2026-07-12
- The intellectual core promised by [ADR-002](002-authorization-model.md) (US-3.3):
  the pure, total evaluation function. ADR-002 called it "the hardest part, by intent."

## Context

[ADR-002](002-authorization-model.md) fixed the **model** (hybrid ReBAC + RBAC + ABAC, IAM-style
deny-override, explainable `reasons`); [ADR-011](011-pdp-core-location.md) fixed **where** the
pure core lives (`apps/api/src/authz/domain/`, no IO). US-3.3 forces the remaining question:
**how** the pure evaluator turns already-resolved facts into a `Decision` — and, just as
importantly, **how much** of ADR-002's ambition v1 actually implements.

The full model is large: ABAC conditions, explicit `forbid`s, permission boundaries, org
guardrails, `computed_userset` / `tuple_to_userset` rewrites, and unbounded userset recursion.
Shipping all of it at once is neither property-testable in one step nor honest about what works.
We need a decision on the **v1 subset**, the **boundary line**, and the **structural seams** that
keep the deferred pieces cheap to add.

The evaluator's non-negotiable constraints are inherited: pure and IO-free
([ADR-011](011-pdp-core-location.md)), org-scoped at every graph hop
([ADR-007](007-tenancy-model.md)), and never trusting caller-supplied context
([ADR-008](008-pdp-trust-model.md)). It consumes facts a US-3.4 orchestrator resolves at a
revision ([ADR-004](004-authorization-consistency-model.md)); this ADR does not re-decide those.

## Decision

**A pure, total, synchronous `evaluate(query, snapshot) → Decision`** in `authz/domain`, plus a
sibling `expand(resource, relation)` sharing one traversal.

1. **Inputs are resolved facts only.** `AuthorizationQuery` = `{ orgId, subject: EntityRef,
action: Action, resource: EntityRef }`. `EvaluationSnapshot` = `{ namespace:
NamespaceDefinition | null, tuples: TupleIndex }`, where `TupleIndex` is an immutable,
   **org-scoped** value object built by the orchestrator via `listByObject` reads. There is **no
   `context` parameter** — ADR-008 context-invariance holds _by construction_, not by discipline:
   the function has no channel through which a forged attribute could arrive.

2. **Ordered algorithm.**
   1. _Org guard_ — if the index's org (or a present namespace's org) ≠ `query.orgId`, `deny`
      (`org_mismatch`). The index is built org-scoped, so cross-org tuples are absent by
      construction; this is defense in depth.
   2. _Required relations_ — `namespace.requiredRelationsFor(action)`; a missing namespace,
      namespace mismatch, or unbound verb yields the empty set ⇒ `deny` (`unknown_action`).
   3. _Collect grants_ — for each required relation, resolve membership of `query.subject` in
      `resource#relation` by a **bounded ReBAC walk**: a **direct** tuple match, or **one userset
      level** (role/group membership). Results are a **UNION** across relations and userset
      branches, **deduplicated** by an `object#relation` visited set.
   4. _Deny-override pipeline_ — collect `forbid`s (an empty placeholder in v1); if any, `deny`.
      Else if any grant, `permit`. Else `deny` (`default_deny`).

3. **"One userset level" is the deliberate v1 depth.** `MAX_USERSET_DEPTH = 1`: a userset subject
   (`resource#viewer@group:eng#member`) is expanded once into its direct members; a **nested**
   userset (`group:eng#member@group:leads#member`) is **not** followed and therefore **does not
   grant**. A separate `object#relation` **visited set** is the cycle guard. Either guard alone
   guarantees termination; the depth cap encodes the product boundary, the visited set becomes
   load-bearing the day the cap is raised.

4. **Role hierarchy comes from the action→relations binding, not graph rewrites.** `document.read
⇐ viewer | editor | owner` is expressed as the required-relations UNION (step 2.3), which _is_
   the RBAC-over-ReBAC unification ([ADR-002](002-authorization-model.md)). v1 ships **no**
   `computed_userset` / `tuple_to_userset` rewrites.

5. **Explainability.** `Reason` gains two optional fields — `relation?` (the granting required
   relation) and `path?` (the ordered tuple keys of the derivation, `resource#relation@subject`
   form). A `permit` carries `grant.direct` (one key) or `grant.userset` (two keys); a `deny`
   carries `default_deny`, `unknown_action`, or `org_mismatch`. The fields are optional, so the
   change is backward-compatible and feeds the future playground/analyzer.

6. **`expand` is bounded, not a stub-in-name-only.** `expand(orgId, resource, relation, snapshot)
→ readonly EntityRef[]` returns the **relationship closure** of `resource#relation` under the
   _same_ rules (direct + one userset, org-scoped, guarded), flattened to **concrete subjects**.
   Sharing the traversal with `evaluate` makes **check/expand agreement** a property, not a hope:
   a subject appears in `expand(resource, R)` iff `evaluate` grants an action whose required
   relations include `R`.

7. **Totality.** The function contains no `throw`, no `await`, no `Date`/random, no IO. `Action`
   is a validated VO; `EntityRef`s are compared field-wise (never re-parsed); an unknown
   namespace/verb, a null namespace, or an empty snapshot all funnel to `deny`. Recursion is
   bounded by depth and visited set. It returns a `Decision` for **every** type-valid input.

**Deliberately deferred (documented boundaries):** ABAC conditions, explicit `forbid`s,
permission boundaries and org guardrails, `computed_userset` / `tuple_to_userset` rewrites,
userset recursion beyond one level (nested groups), a Zanzibar-style userset **tree** from
`expand`, and any caching ([ADR-004](004-authorization-consistency-model.md)). The seams are
reserved: the deny-override pipeline has a forbid-collection point, `MAX_USERSET_DEPTH` is the one
knob that unlocks nesting, and the shared resolver localizes where rewrites will hook in.

## Consequences

### Positive

- **Property-testable in isolation** (the rigor [ADR-011](011-pdp-core-location.md) set up):
  deny-by-default and deny-override (as _collect-grants-then-deny_), org isolation, determinism,
  cycle safety, and check/expand agreement all map to `fast-check` properties over pure inputs.
- **ADR-008 invariance is structural.** No context parameter means no forgeable channel; the
  property degenerates to "the decision is a function of `(query, snapshot)` alone."
- **Honest, shippable MVP** that still unifies RBAC and ReBAC (via the action→relations UNION) and
  produces explainable derivation paths.
- **Cheap to grow.** Nesting, rewrites, and forbids slot into named seams without reshaping the
  contract or the tests.

### Negative / costs

- **Nested groups silently do not grant in v1.** A member of a group nested inside a viewer group
  is denied. This _must_ be surfaced in user-facing docs and the analyzer, or it reads as a bug.
- **No conditional access yet.** MFA/IP/time gates ([ADR-008](008-pdp-trust-model.md) classes 1–2)
  are out until policies land; v1 authorization is purely relationship-derived.
- **`Reason` shape churn.** Adding `relation?`/`path?` now (vs. a later breaking change) is a bet
  that the playground needs the derivation path — a low-risk bet given optional fields.
- **`expand` is an _exact_ answer in v1 but becomes an over-approximation** once ABAC forbids
  narrow it ([ADR-002](002-authorization-model.md)); the return type must not imply otherwise.

## Alternatives considered

- **Implement the full ADR-002 model in v1** — rejected: a big-bang evaluator is not
  incrementally testable and hides which invariants actually hold. Deny-override and org
  isolation are worth proving on a small, total core first.
- **Unbounded userset recursion now** — rejected: the cost/cycle risk is real and the guards
  would be untested theater at depth 1. One level covers RBAC-over-ReBAC; raising
  `MAX_USERSET_DEPTH` later reuses the same visited-set guard.
- **`computed_userset` rewrites for role hierarchy** — deferred: v1 gets hierarchy from the
  action→relations UNION binding, which needs no graph rewrite and no extra config surface.
- **Pass a `context` parameter but ignore it** — rejected: a latent forgery channel and a
  discipline-not-structure guarantee. Absence is strictly stronger and lint-clean.
- **Keep `Reason {code, message}` only** — rejected: the analyzer and playground need the matched
  tuples / derivation path; optional fields add explainability at zero compatibility cost.
- **`expand` returns a full Zanzibar userset tree** — deferred: over-built for v1. A deduplicated
  concrete-subject closure answers "who can access X" and is exactly what the agreement property
  needs to assert.
- **A thin `readonly RelationTuple[]` snapshot** — rejected in favor of the indexed `TupleIndex`
  VO: org-scoping and O(1) `subjectsOf` lookups become properties of the data structure, so
  cross-org isolation ([ADR-007](007-tenancy-model.md)) is enforced by construction rather than by
  careful loop code.
