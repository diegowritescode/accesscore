# ADR-001: Architecture style — Hexagonal modular monolith with DDD

- **Status:** Accepted (2026-07-11)
- **Date:** 2026-07-11

## Context

AccessCore is a security-critical system with a genuinely complex domain (the authorization
engine). It must be: correct and heavily testable, evolvable (capabilities added as rings),
and deployable/operable by a single developer. It must also read as senior-level engineering,
not a framework tutorial.

Two failure modes to avoid: (1) a distributed microservice architecture whose operational
overhead is unjustified at this scale, and (2) an anemic layered CRUD app where business
rules leak into controllers and the ORM.

## Decision

Build a **modular monolith** using **Hexagonal (Ports & Adapters)** architecture and **DDD
tactical patterns**.

- One deployable process; modules (`identity`, `authn`, `authz`, `tenancy`, …) with explicit
  boundaries, each owning its data.
- Four layers per module: **domain** (pure, no framework/ORM), **application** (use cases +
  ports), **infrastructure** (adapters), **interface** (NestJS controllers/guards + SDK).
- Domain modeled with aggregates, value objects (`Email`, `PasswordHash`, `UserId`, …),
  domain services, and domain events published via a transactional outbox.
- Errors modeled as a `Result`/domain-error type in the domain/application layers; exceptions
  are reserved for truly exceptional infrastructure failures. HTTP mapping happens only at the
  interface layer.

## Consequences

### Positive

- Domain and the PDP are unit-testable in isolation (no DB/HTTP) → enables property-based
  testing of the decision engine.
- Clear seams: the outbox is the future integration point to EventBridge; modules could be
  extracted to services later _if ever justified_.
- Demonstrates architectural judgment and clean code — the stated goal.

### Negative / costs

- More upfront structure and boilerplate than a controller-service-repository CRUD app.
- Requires discipline to keep modules from reaching into each other's internals.

## Alternatives considered

- **Microservices** — rejected: network, deployment, and distributed-debugging cost is
  unjustified for the current scale; premature distribution.
- **Layered/CRUD only (transaction script)** — rejected: business rules and the authorization
  logic would erode into controllers and the ORM; untestable and low-signal.
- **Full Clean Architecture with strict CQRS everywhere** — deferred: CQRS is applied only
  where it earns its keep (read models for the console/analyzer), not globally.
