# ADR-014: Policy Administration Point — HTTP write API and its authorization model

- **Status:** Accepted (2026-07-13)
- **Date:** 2026-07-13
- The write half of the graph: it turns the internal writers into a guarded HTTP surface and
  resolves the self-authorization question [ADR-002](002-authorization-model.md) left open —
  without which a live deployment can only ever return `deny`, because there is no API path to
  author an ACL.

## Context

The authorization graph is today writable **only** through internal application services —
`RelationTupleWriter.write/revoke`, `NamespaceConfigWriter.define`, and
`TenancyService.provisionPersonalOrganization`. There are **no HTTP write endpoints**.
`POST /authz/check` is live and read-only ([ADR-013](013-cross-service-authorization-contract.md)),
so a deployed instance has no tuples and no namespaces and therefore answers `default_deny` to
every query. The Policy Administration Point (PAP) is the missing write half.

[ADR-002](002-authorization-model.md) deferred the mechanism: _"The PAP authorizes its own writes
through the PDP, bootstrapped by an initial super-admin."_ That is the crux of this ADR, and it is
security-critical. Writing `document:1#viewer@user:x`, or defining the `document` namespace, must
itself require permission. If it does not, any authenticated caller escalates to full control of
their org's graph — they grant themselves any relation on any object, and object-level
authorization is decorative. **An unauthorized PAP is a privilege-escalation hole.** The
write-authorization model and its bootstrap are the core decision here; the endpoint shapes are
secondary.

The inherited invariants are not re-decided:

- Identity and the active org derive **only** from the cryptographically verified access token —
  never from a body field ([ADR-008](008-pdp-trust-model.md), [ADR-007](007-tenancy-model.md)).
- The write-boundary charset rules already live in the domain: `assertWritableEntityRef` rejects a
  `type` that is not an identifier and an `id` that is empty or contains `:` `#` `@`;
  `assertWritableSubject` extends this to userset relations (M1).
- The writers already return a `ConsistencyToken` — the zookie
  ([ADR-004](004-authorization-consistency-model.md)) — that must flow back to the caller.

A current-state check matters for the bootstrap. `Membership {id, userId, orgId, status, joinedAt}`
carries a `status` (`active | suspended`) but **no role or owner concept**, and
`provisionPersonalOrganization` makes the creator an `active` member — **not** a marked owner. So
"the org creator is the owner" is not yet true in the data model; the bootstrap has to _establish_
it.

## Decision

**Adopt the hybrid (c): gate PAP writes on org ownership from `tenancy` for v1, with the org creator
auto-granted owner at provisioning as the bootstrap, and a documented, additive migration to full
self-referential PDP-authorized writes.** The endpoints expose the existing writers unchanged; the
new surface is one authorization guard plus DTOs.

1. **Write-authorization — org-ownership gate now (`PapAdminGuard`).** A PAP write requires the
   caller to be an **owner** of the org derived from the token. A `PapAdminGuard` runs after
   `AccessTokenGuard`, reads the caller's membership for `token.org` through a new `tenancy` read
   port (`OrgRoleReader.roleOf(userId, orgId)`), and admits only an **active owner**; anything else
   is a `403`. The gate is deliberately **maximally narrow**: owner-of-the-current-org only, no
   per-object or per-namespace nuance, no delegation. It is a single guard, property-tested to prove
   a non-owner cannot write. This is a second authorization path _outside_ the PDP — accepted as a
   bridge (see cost below and Alternative (a)), not the destination.

2. **Bootstrap — the org creator is auto-granted owner.** Add a `role` to `Membership`
   (`owner | member`, with `admin` reserved for future delegation) and set the creator to `owner`
   inside `provisionPersonalOrganization` (schema migration + one domain change). This is the seed:
   the first administrator of every org is its creator, established atomically at provisioning under
   the existing UnitOfWork. No god account is needed for the personal-org v1 — all authority flows
   from token identity + the `org` claim, so the bootstrap is [ADR-008](008-pdp-trust-model.md)-safe
   by construction. **v1 ships no platform super-admin path.** The per-tenant creator-owner bootstrap
   covers every v1 need (personal orgs), and adding an unused config/env "god-subject" escape hatch
   now is exactly the config-trust surface a security reviewer should question. A platform super-admin
   for genuine cross-org operations (seeding shared/system namespaces, provisioning orgs on behalf of
   others) is a **documented future addition**, introduced only when such an operation actually exists
   — and even then keyed on a verified token `sub`, never a body field.

3. **Endpoint surface — the authz graph only, org-scoped from the token.**

   | Route                              | Purpose                           | Success | Body                    |
   | ---------------------------------- | --------------------------------- | ------- | ----------------------- |
   | `POST /authz/tuples`               | write (upsert) a tuple            | `200`   | `{ consistency_token }` |
   | `DELETE /authz/tuples`             | revoke a tuple (delete-if-exists) | `200`   | `{ consistency_token }` |
   | `PUT /authz/namespaces/:namespace` | define/replace a namespace config | `200`   | `{ consistency_token }` |

   All three are `@UseGuards(AccessTokenGuard, PapAdminGuard)`. The `orgId` passed to the writers is
   **always** `token.org`, never a body field; a `null` `org` claim (no active org) is a `403`
   (`no_active_org`). Writes are **idempotent** — upsert, delete-if-exists, and PUT-replace all
   converge to a state — so `200 + zookie` ("the graph is now at least this") is the honest shape and
   retries are safe; `201 Created`/`Location` is rejected as a mismatch for idempotent convergence.
   **Org and membership administration** (`POST /orgs`, invitations, role grants) is **deferred to a
   later `tenancy`-admin slice** and would reuse the same owner gate; v1 provisions the personal org
   at registration, so the PAP needs no org-creation endpoint to function.

   The DTOs (zod, matching the `check.dto.ts` pattern):

   ```
   POST   /authz/tuples          { object: {type, id}, relation, subject: {type, id, relation?} }
   DELETE /authz/tuples          { object: {type, id}, relation, subject: {type, id, relation?} }
   PUT    /authz/namespaces/:ns   { relations: string[], actions: Record<string, string[]> }
   ```

   `subject.relation` present ⇒ a userset subject (`object#relation`); absent ⇒ a concrete subject.

4. **M1 lands as a `400` at the PAP edge.** The zod DTOs mirror the domain writability rules — `type`
   matches the identifier pattern (`isIdentifier`), `id` is non-empty and contains none of `:` `#`
   `@`, and a userset `relation` is an identifier — so an invalid entity ref is a clean **`400`**
   _before_ the writer is called. The domain `assertWritableEntityRef` / `assertWritableSubject`
   throws remain **defense in depth**: if one ever fires it means the DTO and domain drifted and it
   surfaces as a `500`, which a conformance test asserts is unreachable. `NamespaceConfig` validation
   errors (empty relations, unknown relation binding, invalid verb) map from the writer's `Result`
   to a **`400`** with the error code in the problem detail.

5. **Consistency tokens flow back (the zookie loop).** Each write returns
   `ConsistencyToken.encode()` as `consistency_token`. The caller (console, SDK admin surface, or a
   downstream service) **stores that token on the resource it just changed** and threads it into
   subsequent `check` calls as `consistency_token` — the cross-actor-safe pattern from
   [ADR-013](013-cross-service-authorization-contract.md) §5 and
   [ADR-004](004-authorization-consistency-model.md). This closes the loop end to end: a PAP write
   emits a revision → the resource stores it → a PEP `check` evaluates against data _at least_ that
   fresh.

6. **Composition with the SDK and the console.** The PAP is the **admin plane**, distinct from the
   `check` hot path. The [ADR-013](013-cross-service-authorization-contract.md) SDK stays read-only
   (`check`) for v1; an additive `client.writeTuple` / `defineNamespace` admin surface can wrap these
   endpoints later over the **same** token-forwarding provenance — the owner's verified token is
   forwarded, `PapAdminGuard` re-checks ownership server-side, nothing is caller-asserted. The console
   ([roadmap](../scope-and-roadmap.md), Slice 7) drives these endpoints with the owner's token; the
   ACL editor and namespace editor are exactly the owner-gated surface, and the owner gate is what
   makes the console safe to expose.

7. **Errors are RFC 7807** via `ProblemException`, consistent with `authz.controller.ts`: `400`
   invalid DTO / namespace config, `401` unauthenticated, `403` not an owner or no active org, `503`
   on a store/transaction error (mirroring the `check` endpoint's fail-closed 503).

## Consequences

### Positive

- **The graph becomes writable over HTTP** and a deployed instance can finally answer `permit`. This
  unblocks the console, end-to-end tests, and any live demo — the write half the read API has been
  waiting on.
- **[ADR-008](008-pdp-trust-model.md) / [ADR-007](007-tenancy-model.md) hold by construction.** Org
  and identity come only from the verified token; there is no body-supplied `org` to forge, exactly
  as on the `check` endpoint.
- **The gate has a real home and is trivial to reason about.** Ownership lives in `tenancy`; the
  guard is one lookup with one yes/no answer, property-testable ("a non-owner cannot write") without
  the chicken-and-egg bootstrap that the self-referential model demands.
- **The bootstrap is shared groundwork, not throwaway.** Establishing the creator as owner at
  provisioning is required by the self-referential target too, so nothing built here is discarded on
  migration.
- **M1 is a clean `400` at the edge**, with the domain assertion as defense in depth — the two-layer
  story a security reviewer wants to see.
- **Idempotent writes** (upsert / delete-if-exists / PUT) make retries safe under partial failure;
  each returns its zookie so the consistency loop is closed.

### Negative / costs

- **A second authorization path outside the PDP.** The system now has two authz mechanisms — the PDP
  for application resources and tenancy-ownership for PAP writes. Two paths can diverge in hardening;
  this is the central cost of (c) over (a). Mitigated by keeping the gate maximally narrow (owner of
  the current org, no delegation, no object-level nuance), a single guard, a property test, and a
  written migration trigger to fold it into the PDP.
- **A new cross-module read coupling, `authz → tenancy`.** The PAP guard reads membership/role through
  a `tenancy` port — the same shape as the `authn ↔ identity` cross-link
  ([ADR-010](010-session-revocation-and-context-coupling.md)), and a one-directional read, so no
  provider cycle. Still, it is a new seam to maintain.
- **A schema migration** to add `role` to `memberships`, plus a change to
  `provisionPersonalOrganization`.
- **Coarse authority.** A v1 owner can write **anything** in their org — any tuple on any object, any
  namespace. There is no per-object or per-namespace delegation; that is precisely what the
  self-referential model (a) buys and is deliberately deferred.
- **No cross-org platform operation is possible in v1.** Seeding a shared/system namespace across orgs
  has no path until the deferred platform super-admin lands — an accepted v1 limitation (there is no
  cross-org use case yet), preferred over shipping an unused config-trust escape hatch.

## Alternatives considered

- **(a) Self-referential authorization via the PDP now** — **deferred; this is the north star.** A
  write would require `check(caller, "namespace.administer", org:<orgId>)` and
  `check(caller, "tuple.write", <object>)` (or an org-level admin action): the PAP calls the same
  engine it administers. It is elegant, dogfoods the PDP, keeps a **single** authz path, and is a
  strong seniority demo ("the PAP authorizes itself through the engine it administers"). Rejected for
  v1 because: (i) **chicken-and-egg bootstrap** — a seeded system `org`/admin namespace and the owner
  tuple must be written out-of-band (via the internal writer, bypassing the guard) before any check
  can pass; (ii) it requires **modeling admin actions** (`tuple.write`, `namespace.administer`) and
  deciding object-level vs org-level write authority — a design slice of its own; (iii) getting it
  **subtly wrong on a security-critical path** is the worst possible outcome. The v1 evaluator
  ([ADR-012](012-pdp-evaluation-algorithm.md): direct tuple + one userset level) already supports the
  required checks, so the migration is **additive**, not a rewrite. Trigger to migrate: the moment we
  need per-object / per-namespace delegation, or a shared admin console spanning orgs.
- **(b) Tenancy-role gate as the permanent model** — rejected as the _destination_: fine for v1 but it
  ossifies a second authz path forever and cannot express per-object delegation. We adopt its
  mechanism only as a bridge — that is what makes this decision (c) rather than (b).
- **Platform super-admin as the primary bootstrap** (the literal reading of
  [ADR-002](002-authorization-model.md)'s sketch) — rejected as primary: a config/env god-subject is
  the wrong thing to lean on for tenant self-service; the per-tenant creator-owner bootstrap needs no
  god account. **Not included in v1** — deferred as a future addition if and when a real cross-org
  platform operation exists (Decision §2).
- **Body-supplied org, or a caller-asserted admin flag** — rejected outright: this is the
  forgeable-oracle hole [ADR-008](008-pdp-trust-model.md) closed. Org and identity come only from the
  verified token.
- **Zanzibar-style `batchWrite` (a single endpoint taking atomic touch/delete deltas)** — deferred: a
  `WriteRelationships`-style multi-delta write under one revision is the eventual shape. v1 ships the
  simple single-tuple write/revoke pair (still one revision each); because the writer already runs in
  a UnitOfWork transaction, batching deltas under one revision is a later additive change.
- **`201 Created` + `Location` for tuple writes** — rejected: tuple writes are idempotent upserts and
  revokes are delete-if-exists, so `200 + zookie` ("converge to this state") models the semantics
  honestly and keeps retries safe.
