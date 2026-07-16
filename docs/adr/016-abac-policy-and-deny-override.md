# ADR-016: ABAC policy layer — conditions and deterministic deny-override (PDP v3)

- **Status:** Accepted (2026-07-13)
- **Date:** 2026-07-13
- **Implementation: in progress (Slice 5, milestone #5).** The ReBAC + RBAC core shipped in Slices 3-4;
  this ABAC layer is now being built US by US (US-5.0 onward). US-5.0 lands the model, the condition AST,
  the trusted-context types, and enables the `intersection` / `exclusion` `Userset` nodes; the evaluator,
  policy store, and deny-override follow in US-5.1–5.5.
- The sequel to [ADR-015](015-userset-rewrites-and-rebac-evaluation.md): it wraps the pure,
  context-free ReBAC evaluator with the ABAC pillar [ADR-002](002-authorization-model.md) promised —
  a Cedar-inspired `permit`/`forbid` policy layer with `when`/`unless` conditions and IAM-style
  deny-override — and enables the `intersection` / `exclusion` `Userset` nodes ADR-015 reserved.

## Context

[ADR-015](015-userset-rewrites-and-rebac-evaluation.md) shipped the full union-only ReBAC walk and
shaped the `Userset` tree so ABAC would slot in **additively**. Two gaps remain from
[ADR-002](002-authorization-model.md): the tree has no `intersection` / `exclusion` (structural
relationship algebra — "editors who are not suspended"), and there are **no conditional policies**
(MFA/IP/time gates). Slice 5 closes both.

The hazard is precise, and a security review already flagged three one-line-from-bypass traps:

1. ABAC needs **attributes**, but today `evaluate` is context-free _by construction_
   ([ADR-008](008-pdp-trust-model.md)) — that is exactly why it is total, cacheable
   ([ADR-004](004-authorization-consistency-model.md)), and forgery-proof. Reintroducing `context`
   naively reopens the forgeable-oracle hole.
2. **Deny-override must be total and order-independent** — an explicit `forbid` always wins.
3. **Fail-closed is asymmetric**: a `permit` whose condition errors must _not_ match; a `forbid`
   whose condition errors _must_ match. A uniform `try/catch → false` silently disables every
   `forbid` — a fail-**open** bypass.

The inherited invariants are not re-decided: the ReBAC core stays pure/IO-free
([ADR-011](011-pdp-core-location.md)), org-scoped at every hop ([ADR-007](007-tenancy-model.md)),
context-invariant _by construction_ ([ADR-008](008-pdp-trust-model.md)), and revisioned
([ADR-004](004-authorization-consistency-model.md)).

## Decision

**Keep the ReBAC evaluator context-free and unchanged in shape; add a separate, pure policy layer
that _wraps_ its decision under a total deny-override; feed that layer a `EvaluationContext`
assembled server-side from already-trusted inputs — never the request body.** `intersection` /
`exclusion` are enabled inside the pure core as structural relationship algebra.

### 1. Two planes, not one channel

- **ReBAC plane (context-free, unchanged).** `evaluate` / `derive` / `collectMembers`
  (`authz/domain/evaluate.ts`) still take only `(query, snapshot)` and yield the relationship grant.
  `intersection` / `exclusion` are new `Userset` node kinds resolved here — they are pure graph
  algebra, not attributes, so they belong in the cacheable core.
- **Policy plane (new, pure, context-aware).** A new `authz/domain/policy/` module exposes a total
  `decide(rebac: Decision, policies, ctx: EvaluationContext) → Decision`. Context lives _only_ here;
  the ReBAC core never gains a `context` parameter, so ADR-008 invariance stays structural.

### 2. Trusted `EvaluationContext` — provenance, not the body

`PdpService` builds the context from the already-verified `Principal` (token-derived) and the
server-observed `RequestContext`; the `check` DTO body carries only `action` / `resource` /
`consistency_token` and contributes **nothing** to conditions.

```ts
interface EvaluationContext {
  readonly principal: { readonly aal: number; readonly authTime: Date | null };
  readonly env: { readonly ip: string; readonly now: Date };
  readonly resource: Readonly<Record<string, never>>;
}
```

| Attribute            | Source                                        | ADR-008 class   |
| -------------------- | --------------------------------------------- | --------------- |
| `principal.aal`      | verified token `aal` (`mfaPresent ⇔ aal ≥ 2`) | (1) assurance   |
| `principal.authTime` | verified token `auth_time`                    | (1) identity    |
| `env.ip`             | server-observed at the PEP edge (`@Ip()`)     | (2) environment |
| `env.now`            | injected `Clock`                              | (2) environment |
| `resource.*`         | **reserved/empty in Slice 5**                 | (3) — deferred  |

Slice-5 conditions reference **only classes (1) and (2)**, exactly as ADR-008 §Decision mandates.
Authorization-relevant _resource facts_ stay in the graph (modeled as tuples, composed with
`intersection` / `exclusion`), not as caller-adjacent attributes; a PIP / signed entity store for
class-(3) attribute conditions is the [ADR-008](008-pdp-trust-model.md)-deferred follow-up, and the
empty `resource` slot is where it lands additively.

### 3. Policy model + condition AST (JSON, not a grammar)

A policy is a targeted `permit` / `forbid` with a boolean condition. `when { C }` matches iff `C`
holds; `unless { C }` desugars to `when { not C }`, so we store one effective `condition`.

```ts
interface Policy {
  readonly id: string;
  readonly orgId: OrgId;
  readonly effect: 'permit' | 'forbid';
  readonly resourceType: string;
  readonly action: string | '*';
  readonly condition: Condition;
  readonly revision: Revision;
}

type Term =
  | { readonly kind: 'attr'; readonly path: 'principal.aal' | 'env.ip' | 'env.now' }
  | { readonly kind: 'lit'; readonly value: boolean | number | string };

type Condition =
  | { readonly kind: 'and' | 'or'; readonly children: readonly Condition[] }
  | { readonly kind: 'not'; readonly child: Condition }
  | {
      readonly kind: 'cmp';
      readonly op: 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge';
      readonly left: Term;
      readonly right: Term;
    }
  | { readonly kind: 'in'; readonly needle: Term; readonly set: readonly (string | number)[] }
  | { readonly kind: 'ipInCidr'; readonly ip: Term; readonly cidrs: readonly string[] };
```

**DSL totality (write-time, `Result → 400`).** The condition language is deliberately not
Turing-complete: booleans over a **fixed typed attribute set**; `and` / `or` / `not`, typed
comparisons, `in` over a **literal** set, and a built-in `ipInCidr` (no caller regex → no ReDoS; no
user functions, loops, or arithmetic beyond compare). Each `attr` has a declared type
(`aal: number`, `ip: string`, `now: timestamp`); comparisons are **type-checked at PAP write time**
so `eq(number, string)` is a `400` and the runtime evaluator never performs a JS coercion. Depth and
node-count **caps** bound cost. Validation is a `Result`-returning `Condition.parse()` (domain) plus
a recursive zod schema at the PAP edge — the two-layer story of
[ADR-014](014-policy-administration-point.md) §4 — and the evaluator is `fast-check`-fuzzed for
totality. **JSON AST is the canonical stored form** (see Alternatives): directly zod-typed, matching
the `Userset` JSONB precedent, with no parser to fuzz on a security-critical path.

### 4. The combined deny-override algorithm (fail-closed, order-independent)

`decide` is total and pure; three-valued condition results carry the asymmetry.

```ts
type Verdict = true | false | 'indeterminate';

function decide(rebac: Decision, policies: readonly Policy[], ctx: EvaluationContext): Decision {
  const applicable = policies.filter((p) => targetMatches(p, ctx));
  for (const p of applicable) {
    if (p.effect === 'forbid' && evalCondition(p.condition, ctx) !== false) {
      return deny([{ code: 'forbid_matched', message: `Forbidden by policy ${p.id}.` }]);
    }
  }
  if (rebac.effect === 'permit') return rebac;
  for (const p of applicable) {
    if (p.effect === 'permit' && evalCondition(p.condition, ctx) === true) {
      return permit([{ code: 'grant.policy', message: `Permitted by policy ${p.id}.` }]);
    }
  }
  return deny([{ code: 'default_deny', message: 'No grant path resolved; denied by default.' }]);
}
```

- **Default deny**, then: any matching `forbid` ⇒ **deny** (wins over every `permit` and every
  relationship grant, regardless of order); else a relationship grant **or** a matching `permit` ⇒
  **permit**; else **deny**.
- **Fail-closed asymmetry, made structural:** a `forbid` matches on `!== false` (true **or**
  `indeterminate`); a `permit` matches on `=== true` only. `evalCondition` returns `indeterminate`
  (never throws) for a missing/untypable attribute, so a broken `forbid` denies and a broken `permit`
  is inert — the exact opposite of a uniform `try/catch → false`.

### 5. `intersection` / `exclusion` in the pure core

`derive`: `intersection(children)` grants the target iff **every** child grants; `exclusion(A, B)`
grants iff `A` grants **and** `B` does **not**. `collectMembers`: set-intersection and set-difference
of the operands. **Visited-scope correction (fail-closed):** ADR-015's single shared `visited` set is
fail-closed for `union` (a prune can only _miss_ a grant). For a **negative** operand it inverts — a
pruned/truncated `B` that wrongly reports "not a member" flips `A − B` from deny to permit
(fail-**open**). So each operand of `intersection` / `exclusion` resolves with an **independent
visited scope**, and **truncation inside any operand forces the composite to no-grant** rather than
reuse union's prune. Pinned by a regression + `fast-check` property (no forged-open on a depth
diamond).

### 6. PdpService integration, caching, `expand`

In `evaluateWithin`, after `evaluate` yields the context-free ReBAC decision, load the org's policies
for `(resourceType, action)` in the **same** read-only repeatable-read transaction, build the
`EvaluationContext` from `Principal` + `RequestContext`, and return `decide(rebac, policies, ctx)`.
**Caching ([ADR-004](004-authorization-consistency-model.md)):** the context-free sub-result stays
cacheable by `(orgId, revision, resource#relation)`; the **post-policy** decision is **never** cached
keyed by relation/tuple alone (a cached `permit` must not bypass a later step-up/IP `forbid`). With
no policy targeting `(resourceType, action)`, `decide` is the identity and the decision stays
cacheable. Slice 5 adds no cache; it preserves the seam. **`expand` stays closure-only:** it resolves
`intersection` / `exclusion` structurally but ignores conditions, so for conditional policies it is an
over-approximation ("who _could_ access X"), as in [ADR-002](002-authorization-model.md) /
[ADR-012](012-pdp-evaluation-algorithm.md).

### 7. Storage, PAP write plane, migration

A dedicated **`policies`** table (`id, org_id, effect, resource_type, action, condition JSONB,
revision, created_at`) — not namespace-attached JSONB — because policies have an independent
lifecycle (add/remove one `forbid` without rewriting a namespace), each write allocates its own
revision, and the deny-override collection is an indexed `(org_id, resource_type, action)` read that
mirrors the tuple store. PAP write plane mirrors [ADR-014](014-policy-administration-point.md):
owner-gated, revisioned, idempotent `200 + zookie`.

| Route                        | Purpose          | Body                                          |
| ---------------------------- | ---------------- | --------------------------------------------- |
| `PUT /authz/policies/:id`    | upsert a policy  | `{ effect, resourceType, action, condition }` |
| `DELETE /authz/policies/:id` | delete-if-exists | —                                             |

**Migration is additive:** one new `policies` table (Drizzle-kit, [ADR-005](005-persistence-and-orm.md));
`intersection` / `exclusion` need **no DDL** (optional JSONB on `NamespaceConfig`, per ADR-015). Every
existing config and decision is unchanged when no policy exists.

### 8. Permission boundaries + org guardrails — model now, enforce later (recommended defer)

A **permission boundary** is a per-principal ceiling: the effective permit must lie **within** it, and
**absence for a _bounded_ principal = deny** (empty ceiling, never "unlimited"), assignable only by an
authority strictly above the bounded principal. An **org guardrail** is an SCP-like org-wide ceiling,
**platform-operator-only**, immutable to tenant admins (no self-widening). Both _bound_ (intersect an
allow-set) — distinct from a `forbid`, which subtracts. **Recommendation: land the model + an inert
bounding hook in `decide`, defer enforcement.** AccessCore has no delegation-authority model or
platform super-admin yet (both deferred by [ADR-014](014-policy-administration-point.md)); with **zero
bounded principals** the "absent boundary ⇒ deny" invariant is correct and simply never fires, so the
hook is shaped right without risking a slice-wide lockout. Full enforcement ships with the
tenancy-admin / delegation slice.

### 9. Simulation / shadow (no side effects)

`POST /authz/simulate` (owner-gated, read-only) evaluates a `check` against the **live** or a
**proposed** policy overlay with **no** decision-log write and **no** revision allocation, returning
the decision plus a **diff** against the live decision. It reuses `evaluate` + `decide` over an
overlaid snapshot — the analyzable "what would this change do" surface from
[ADR-002](002-authorization-model.md).

## Consequences

### Positive

- **ADR-002's ABAC pillar ships** — conditional access (MFA/IP/time), explicit `forbid`, and the
  structural `intersection` / `exclusion` algebra, all explainable via reason codes.
- **ADR-008 holds by construction, still** — the ReBAC core stays context-free and context is built
  from already-trusted token + server-observed inputs, so no caller channel can grant; deny-override
  (`forbid`-wins) and the fail-closed asymmetry are `fast-check` invariants over the pure `decide`.
- **Genuinely additive over ADR-015** — `evaluate`'s signature is unchanged; two new `Userset` kinds,
  one new pure module, one new table, additive reason codes — and the context-free sub-result stays
  revision-cacheable while context-touched decisions are excluded from relation-keyed caching.

### Negative / costs

- **A custom condition language** needs a validator, type-checker, caps, and a fuzz harness — and
  **two authoring surfaces** (structural `Userset` vs conditional `Policy`) the docs must disambiguate.
- **`expand` becomes an over-approximation** for conditional policies (documented; the return type
  already does not promise exactness).
- **Boundaries/guardrails are specified but not enforced** in Slice 5 — a stated gap until the
  delegation slice; the inert hook keeps it honest.
- **The negative-operand visited-scope** is subtler than union's shared prune and needs its own test.

## Alternatives considered

- **Embed Cedar / OPA (Rego) instead of building the subset** — rejected (as ADR-002 leaned): a heavy
  runtime/WASM dependency and a far larger analysis/attack surface than our total subset, and neither
  fuses cleanly with the ReBAC closure + revision/consistency model. We keep Cedar _semantics_
  (`permit`/`forbid`, `when`/`unless`, deny-override) and build the analyzable subset; swapping the
  evaluator for Cedar later stays an ADR-worthy option.
- **Textual DSL (grammar + parser) as the canonical form** — rejected as canonical: a parser is a new
  fuzz/ReDoS surface on a security-critical path. The JSON AST is directly zod-typed and matches the
  `Userset` precedent; a textual authoring surface can compile _to_ the AST in the Slice-7 playground.
- **Attach conditions as a `Userset` node (condition-in-the-tree)** — rejected: it would force
  `context` into the context-free core (breaking ADR-008-by-construction and ADR-004 cacheability),
  and a tree yields a _set_, not a `permit`/`forbid` lattice, so it cannot express deny-override. The
  ReBAC tree stays context-free; the policy lattice wraps it.
- **Enforce permission boundaries now** — rejected for Slice 5: boundaries need a delegation-authority
  model + platform super-admin (both ADR-014-deferred), and "absent boundary ⇒ deny" is only usable
  once principals can be assigned boundaries. We land the model + inert hook and enforce with the
  delegation slice.

## Implementation notes per US

One PR per issue; each maps to a slice of this design.

- **US-5.0 (#72) — model + AST + trusted-context types + enable `intersection`/`exclusion`.** Add
  `Policy` and `Condition` / `Term` types (`authz/domain/policy/`), the `EvaluationContext` type, and
  the two new `Userset` kinds to `userset.ts`; extend `validateUserset` (`namespace-config.ts`) and
  the recursive `usersetSchema` (`pap.dto.ts`) to admit them. **No evaluator change.**
- **US-5.1 (#73) — condition validator + `policies` store + PAP write.** `Condition.parse()` with
  type-check + depth/node caps (`Result`); the `policies` table + repository (Drizzle-kit migration); the
  revisioned `PolicyWriter` (allocate in UnitOfWork, return `ConsistencyToken`); `PUT`/`DELETE
/authz/policies/:id` owner-gated with the zod-edge / domain two-layer `400`.
- **US-5.2 (#74) — pure condition evaluator.** `evalCondition(condition, ctx): Verdict` — total,
  type-safe (no JS coercion), returning `indeterminate` (never throwing) for missing/untypable
  attributes; `fast-check` fuzzed for totality and the fail-closed asymmetry.
- **US-5.3 (#75) — deny-override integration + `intersection`/`exclusion` resolution.** Add the two
  resolver cases to `derive` / `collectMembers` / `loadClosure` with the independent visited scope and
  truncation-forces-no-grant rule; add `decide` and wire it into `PdpService.evaluateWithin` (load
  policies + build context in the same transaction); reason codes `forbid_matched` / `grant.policy`;
  cache ReBAC-only. Properties: `forbid`-wins, order-independence, no forged-open on a depth diamond,
  no caller field flips deny→permit.
- **US-5.4 (#76) — permission boundaries + org guardrails.** Model + `absence-for-a-bounded-principal
= deny` invariant + operator-only guardrails; ship the **inert** bounding pass in `decide`
  (no-op with zero bounded principals). **Recommend: defer full enforcement** to the delegation slice.
- **US-5.5 (#77) — simulation / shadow.** `POST /authz/simulate` (owner-gated, read-only): evaluate
  against a live or proposed policy overlay with no log write and no revision; return the decision +
  a diff vs live.
