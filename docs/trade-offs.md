# AccessCore — Trade-offs

The decisions that shaped AccessCore, the alternatives rejected, and the **cost accepted** for
each. This page is the map; the full reasoning (context, consequences, escape hatches) lives in
the ADR each entry links to. The theme throughout: prefer a small, correct, provable core with
an explicit seam over a large, unproven surface.

| Decision             | We chose                                              | Over                                                 | Cost accepted                                                           | ADR                                                                          |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Architecture style   | Hexagonal modular monolith + DDD                      | Microservices / layered CRUD                         | More upfront structure & boilerplate                                    | [001](adr/001-architecture-style.md)                                         |
| Authorization model  | One hybrid engine we build (ReBAC + RBAC + ABAC)      | Adopting OpenFGA/SpiceDB or embedding Cedar/OPA      | Significant design + test effort — the hardest part, by intent          | [002](adr/002-authorization-model.md)                                        |
| ORM                  | Drizzle + hand-written mappers                        | TypeORM / Prisma / Kysely                            | Manual row↔domain mapping and an explicit Unit of Work                  | [005](adr/005-persistence-and-orm.md)                                        |
| Consistency          | Commit-ordered revision via advisory-locked changelog | Bare sequence / always-consistent / `xmin` snapshots | A serialization point that bounds write throughput                      | [004](adr/004-authorization-consistency-model.md)                            |
| Evaluator scope (v1) | One userset level, no ABAC/forbids yet                | The full ADR-002 model at once                       | Nested groups silently do not grant in v1                               | [012](adr/012-pdp-evaluation-algorithm.md)                                   |
| Decision log (v1)    | Written synchronously after the read tx               | Async/outbox off the hot path                        | Log latency counts against the p99 budget                               | [012](adr/012-pdp-evaluation-algorithm.md) / [architecture](architecture.md) |
| Cross-service authz  | End-user token forwarding                             | Machine on-behalf-of / caller-asserted identity      | No user token ⇒ can't authorize (async flows wait for the machine ring) | [013](adr/013-cross-service-authorization-contract.md)                       |
| Key management       | Non-exportable Vault Transit signing                  | Keys in env/DB, app-held KEK, cloud-KMS-only         | A Vault dependency and a signing network call                           | [009](adr/009-key-management-and-cryptography.md)                            |
| PDP core location    | Pure domain service in `apps/api`                     | Extract `@accesscore/policy-engine` now              | The package stays a stub until a real second consumer exists            | [011](adr/011-pdp-core-location.md)                                          |

## Modular monolith over microservices — [ADR-001](adr/001-architecture-style.md)

One deployable with strong internal module boundaries and four hexagonal layers, rather than a
distributed service-per-context topology. **Rejected:** microservices (network, deployment, and
distributed-debugging cost is unjustified at this scale — premature distribution) and an anemic
layered/CRUD app (business rules would erode into controllers and the ORM). **Cost accepted:**
more structure and boilerplate than a controller-service-repository app, and the discipline to
keep modules from reaching into each other. **Why it pays off here:** the domain and the
evaluator stay unit-testable in isolation (enabling property-based testing), and the transactional
outbox is a clean seam to extract a service later _if ever justified_ — not now.

## Build our own hybrid engine over adopting one — [ADR-002](adr/002-authorization-model.md)

A single PDP unifying ReBAC (Zanzibar tuples), RBAC (roles as usersets), and ABAC (a Cedar-like
DSL) with IAM-style deny-override. **Rejected:** adopting OpenFGA/SpiceDB as the primary build
(excellent, but embedding a finished product removes the engineering the portfolio exists to
demonstrate, and neither covers ABAC conditions natively) and embedding Cedar/OPA (kept as
_inspiration_ for the DSL). **Cost accepted:** this is the largest design and testing effort in
the system, and a custom DSL needs its own parser/validator — deliberately, because the engine is
the differentiator. We benchmark our subset against OpenFGA semantics in tests rather than shipping
their binary.

## Drizzle over TypeORM/Prisma — [ADR-005](adr/005-persistence-and-orm.md)

SQL-first Drizzle with schemas confined to the infrastructure layer and hand-written mappers
returning domain aggregates. **Rejected:** TypeORM (decorator entities invite domain leakage and
its abstraction fights the recursive tuple queries), Prisma (client leaks into the architecture,
less control over exact SQL), and Kysely (close runner-up; Drizzle chosen for tighter
schema+migration cohesion). **Cost accepted:** manual domain↔row mapping and an explicit
Unit-of-Work port (`withTransaction`, an opaque `Tx` handle so Drizzle's transaction type never
reaches application ports). That "cost" is treated as a clean-architecture _feature_ — it keeps
the hexagonal boundary honest and gives full control of the SQL the tuple store needs (exact
indexes, revision-scoped reads, recursive CTEs).

## Advisory-locked commit-ordered revision — [ADR-004](adr/004-authorization-consistency-model.md)

Every authorization-relevant write (tuple, policy, namespace) records into a `revisions`
changelog under a **transaction-scoped advisory lock**, so revision order equals _commit_ order
and reading the high-water mark as `max(revision)` is safe. **Rejected:** a bare Postgres sequence
read as `max(revision)` — adversarial review showed allocation order ≠ commit order, which
reintroduces the new-enemy bug; always-consistent-no-caching (the PDP is on every request's hot
path); event-sourced authz (heavier than needed). **Cost accepted:** revision assignment is
**serialized**, which bounds write throughput. This is a documented, deliberate trade of
throughput for correctness at this scale; commit-timestamp / `xmin` snapshotting is the reserved
escape hatch if the lock ever becomes the bottleneck. The lock is load-bearing — dropping it
silently reopens the correctness hole.

## One-userset-level evaluator in v1 — [ADR-012](adr/012-pdp-evaluation-algorithm.md)

`evaluate(query, snapshot)` is pure, total, and synchronous: an org guard, an action→required-
relations lookup, a **bounded ReBAC walk** (direct tuple match or one userset level), then a
deny-override pipeline. **Rejected:** implementing the full ADR-002 model in one step (not
incrementally testable, hides which invariants actually hold) and unbounded userset recursion now
(cost/cycle risk with guards that would be untested theater at depth 1). **Cost accepted:** a
member of a group **nested inside** another group is denied in v1 (`MAX_USERSET_DEPTH = 1`), and
there is **no conditional (ABAC) access yet** — authorization is purely relationship-derived. Both
are surfaced in docs so they read as boundaries, not bugs; the visited-set cycle guard and the
single depth knob are the seams that make raising the cap cheap. A notable upside of having _no_
`context` parameter: the ADR-008 provenance invariance holds _by construction_ — there is no
channel through which a forged attribute could arrive.

## Synchronous decision log in v1 — [ADR-012](adr/012-pdp-evaluation-algorithm.md) / [architecture.md](architecture.md)

Every `check` persists its inputs, effect, reasons, revision, and latency to an append-only
decision log **synchronously**, after the read transaction. **Rejected (for now):** buffering the
log or emitting it via the outbox relay off the hot path. **Cost accepted:** the write counts
against the PDP's p99 latency budget. Chosen for v1 because it is simple and correct, and because
the outbox relay/publisher is itself deferred to the EventBridge phase; moving the log off the hot
path is planned and the write-side seam already exists.

## Token forwarding over on-behalf-of — [ADR-013](adr/013-cross-service-authorization-contract.md)

Downstream PEPs forward the **end user's** access token to `/authz/check`; AccessCore
re-verifies it and derives the subject/org server-side. **Rejected:** a service-account /
delegated-assertion default (its only ADR-008-safe form needs RFC 8693 token exchange — the
machine ring, premature for a user-in-the-loop v1), caller-asserted `subject`/`org` headers
(exactly the forgeable-oracle hole ADR-008 closed), and a mesh/gateway injecting identity (moves
verification into infra we don't run at this scale). **Cost accepted:** async/background flows
with no user token in hand must carry a still-live short-TTL token on the message envelope or
**wait for the machine ring** (a consumer with no verifiable token fails closed); and forwarding
hands each PEP a live bearer it could replay (mitigated later by per-service `aud` scoping and
downscoped exchange tokens, Ring 1). The payoff: because the contract keys on a _verified token_,
the machine ring slots into the **same** endpoint and **same** `check` call with zero contract
change — only token acquisition is added.

## Non-exportable Vault Transit signing — [ADR-009](adr/009-key-management-and-cryptography.md)

A `Signer` port backed by a KMS/HSM; the app sends a digest and gets a signature, so private key
material never leaves the keystore. Ed25519 where supported (Vault/software), ES256 as the
portable fallback. **Rejected:** private keys in env/DB (one compromise forges everything),
an app-held KEK on the same host (no separation of ciphertext and key), and cloud-KMS-only as the
_default_ (ties the self-hostable story to a cloud account — kept as an adapter). **Cost
accepted:** a Vault (or KMS) dependency to run and a network call per signing operation
(mitigated by caching public material). A single application-host compromise no longer yields
token forgery — the posture the "security is the product" positioning requires.

## PDP core in `apps/api`, not an extracted package — [ADR-011](adr/011-pdp-core-location.md) / [ADR-013](adr/013-cross-service-authorization-contract.md)

The pure evaluator lives in `apps/api/src/authz/domain`; `packages/policy-engine` is a reserved
empty stub. **Rejected:** extracting the evaluator into a published workspace package now.
**Cost accepted:** the stub sits in the tree with no code. Publishing the SDK did **not** pull the
extraction trigger, because the v1 SDK evaluates **remotely** (it forwards to the API, which owns
tuples and revisions) and therefore needs no local evaluator. Extraction becomes justified only
when there's a genuine second consumer of the pure core — client-side/offline evaluation over
cached tuples — which is a future ring, not v1.
