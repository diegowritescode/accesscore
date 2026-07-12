# ADR-005: Persistence & ORM — PostgreSQL with Drizzle

- **Status:** Accepted (2026-07-11)
- **Date:** 2026-07-11

## Context

Persistence must serve a hexagonal system with a demanding core: the ReBAC **relationship
tuple store** (indexed lookups, recursive graph traversal for userset rewrites, revision-
scoped "at least as fresh as" reads for consistency tokens), a **transactional outbox**
(domain change + outbox row committed atomically), real migrations, and DB-enforced
invariants. The domain layer must stay free of any ORM. The chosen ORM must be modern and
type-safe.

## Decision

Use **PostgreSQL** with **Drizzle ORM** (via the `node-postgres`/`pg` driver) as the
infrastructure-layer persistence adapter, and **drizzle-kit** for generated SQL migrations.

- Drizzle table schemas live only in the infrastructure layer. Repository **ports** are
  defined in the application layer and return **domain aggregates/value objects**; the Drizzle
  adapter **maps rows ↔ domain explicitly** (hand-written mappers per aggregate).
- **Unit of Work:** use cases open a `db.transaction(tx => …)`; a transaction-scoped context
  is passed to the repositories and the outbox writer so the aggregate change and its outbox
  message commit atomically.
- The tuple store uses Drizzle's `sql` template for recursive CTEs and revision-scoped reads;
  a monotonic revision (Postgres sequence) backs consistency tokens (see ADR-004).
- Constraints (unique, FK, check) are declared in the schema and emitted to migrations; no
  `synchronize`. JSONB for policy ASTs, namespace configs, and decision-context snapshots.

## Fit assessment (the condition: "only if it fits well, no problems")

**Verdict: fits well — better than TypeORM for this system.**

- ✅ Keeps the ORM in infrastructure. No decorator entities tempting domain leakage; the
  explicit mapper _strengthens_ the hexagonal boundary and is desirable for DDD.
- ✅ SQL-first is ideal for the tuple store (exact indexes, recursive CTEs, revision reads) —
  precisely where an ORM abstraction would fight us.
- ✅ Real SQL migrations + declarative constraints via drizzle-kit.
- ✅ Native transactions cover outbox atomicity.

Friction points and how they're neutralized:

- **No first-party NestJS module** → a small custom DI module provides the `db` instance. Trivial.
- **Manual domain↔row mapping** → standardized mapper functions; extra boilerplate accepted as
  a clean-architecture feature, not a cost.
- **Transaction propagation** → explicit Unit-of-Work pattern (above); we'd want this with any
  query builder.
- **Weaker type inference on raw `sql` graph queries** → localized to the tuple store; covered
  by integration tests against real Postgres.
- **Smaller ecosystem than TypeORM/Prisma** → production-ready; no blocker.

## Consequences

### Positive

- Clean hexagonal boundary; full control of the SQL the hard components need; modern, type-safe.

### Negative / costs

- More hand-written mapping and an explicit UoW pattern; a thin custom Nest integration.

## Alternatives considered

- **TypeORM** — rejected: decorator entities invite domain leakage; its abstraction fights the
  complex tuple queries; maintenance momentum has slowed.
- **Prisma** — rejected: excellent DX but the client leaks into the architecture and gives less
  control over the exact SQL the tuple store requires.
- **Kysely (raw-ish query builder)** — close runner-up (also SQL-first); Drizzle chosen for
  tighter schema + migration cohesion.

## Refinements from adversarial review (2026-07-11)

- **Unit-of-Work port:** application ports never see Drizzle's `tx` type. A `UnitOfWork` port
  exposes `withTransaction(work: (repos) => Promise<T>)`; the infra adapter binds Drizzle's `tx`
  internally and hands back transaction-scoped repositories, preserving hexagonal purity (ADR-001).
- **Commit-ordered revision:** revision assignment uses a `revisions` changelog under a
  transaction-scoped advisory lock ([ADR-004](004-authorization-consistency-model.md)), not a
  bare sequence.
- **Tuple traversal:** recursive CTEs use `UNION` with a max depth and cycle detection, and
  filter `orgId` at every hop ([ADR-007](007-tenancy-model.md)); these use Drizzle's `sql`
  template and are covered by integration tests with cyclic and cross-tenant fixtures.
- **Outbox relay:** a poller uses `SELECT … FOR UPDATE SKIP LOCKED`; consumers are idempotent
  (idempotency key); at-least-once delivery.
