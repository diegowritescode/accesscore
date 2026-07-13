# ADR-013: Cross-service authorization contract — how downstream PEPs ask the PDP

- **Status:** Accepted (2026-07-12)
- **Date:** 2026-07-12
- The pivot that unblocks `@diegowritescode/accesscore-sdk` and the spine: it fixes how
  MiniLedger / EventBridge / CQRS Reporting / the Enterprise Platform enforce authorization
  against AccessCore without reintroducing the forgeable-oracle hole [ADR-008](008-pdp-trust-model.md)
  closed.

## Context

`POST /authz/check` is guarded by `AccessTokenGuard` and derives the principal's `subject`,
`org`, `aal`, and `sid` **only** from the caller's cryptographically verified access token; the
request body carries just `action`, `resource {type, id}`, and an optional `consistency_token`.
The in-process PEP (`@RequirePermission` → `PermissionGuard`) does the same, deriving the
`Principal` from `request.authToken` and calling the PDP domain port directly (no network hop).
There is, by construction, **no channel through which a caller can assert `subject`/`org`** — the
[ADR-008](008-pdp-trust-model.md) invariant.

That is exactly why a downstream service can today only ask "may **this bearer** do X on
resource R" — its PEP must be holding the end-user's AccessCore access token. Three questions
block the SDK:

1. **How does a downstream PEP assert the end-user's identity to `/authz/check`** without
   caller-asserted `subject`/`org` (which [ADR-008](008-pdp-trust-model.md) forbids)?
2. **What happens with no end-user token in hand** — a background job, an async EventBridge
   consumer, or a service acting on its own behalf (machine identity)?
3. **What is the SDK contract** (`@diegowritescode/accesscore-sdk`, a `0.0.0` stub) — the thin
   `check` client plus a NestJS PEP guard mirroring the in-process `@RequirePermission` — and
   where do the shared wire types live so the SDK and the API do not duplicate them?

The trust rule is inherited and not re-decided here: identity must be token-verified
([ADR-008](008-pdp-trust-model.md)), tokens are short-lived asymmetric JWTs verified offline
([ADR-003](003-token-and-session-strategy.md)), the active org is a verified `org` claim
([ADR-007](007-tenancy-model.md)), and reads thread a consistency token
([ADR-004](004-authorization-consistency-model.md)). The machine ring — assume-role, RFC 8693
token exchange, service accounts — is already deferred in
[ADR-003](003-token-and-session-strategy.md) and the [roadmap](../scope-and-roadmap.md) (Ring 1).

## Decision

**Adopt the hybrid: end-user access-token forwarding as the v1 default (user-in-the-loop calls);
machine on-behalf-of deferred to the machine ring, with the seam defined now.** The two PEPs —
in-process and SDK — share **one logical `check` contract**; only the transport differs.

1. **One contract, two transports.** The contract is provenance-based, not caller-based:
   `check(verified-subject, action, resource, consistency) → Decision`, where the subject/org are
   **always derived server-side from a verified token**, never from the request body.
   - **In-process PEP** (`@RequirePermission`): `AccessTokenGuard` has already verified the
     bearer; `PermissionGuard` derives the `Principal` and calls the PDP port directly. No HTTP,
     no re-verification.
   - **SDK PEP** (remote): the downstream service has no PDP. Its guard forwards the incoming
     request's `Authorization: Bearer <end-user token>` to `POST /authz/check`; AccessCore's
     `AccessTokenGuard` re-verifies it (signature, `aud`/`iss`/`exp`, revocation blocklist per
     [ADR-010](010-session-revocation-and-context-coupling.md)) and derives subject/org.
     Same DTO, same `Decision`, same server-side provenance. This is option (a) — "document and
     SDK-wrap what exists" — and it is [ADR-008](008-pdp-trust-model.md)-safe **by construction**:
     the wire DTO has no `subject`/`org` field, so there is nothing to forge.

2. **The SDK client contract.** A zero-dependency typed client whose surface is the check:

   ```ts
   createClient({ baseUrl, audience?, timeoutMs?, fetch? }): AccessCoreClient

   client.check(
     action: string,
     resource: { type: string; id: string },
     opts: { token: string; consistencyToken?: string },
   ): Promise<Decision>   // { effect, reasons[] }
   ```

   `token` is the end-user's AccessCore access token; the client sends it as
   `Authorization: Bearer` and puts only `action` / `resource` / `consistency_token` in the body.
   **Fail-closed by construction:** the client **never throws for control flow** — a timeout,
   transport error, or non-decision HTTP status is normalized into a `deny` carrying a reserved
   synthetic reason code (`pdp_unavailable` for 5xx/network/timeout, `unauthenticated` for a 401
   from the forwarded token), distinct from evaluator codes (`default_deny`, `unknown_action`,
   `org_mismatch`, `no_org_context`, `consistency_unavailable`). A caller that ignores the
   distinction still gets `deny`; a guard that inspects it can return the right status.

3. **The SDK NestJS PEP** mirrors the in-process ergonomics exactly:
   `AccessCoreModule.forRoot({ baseUrl, ... })` provides the client, and a
   `@RequirePermission(action, resourceResolver, zookieResolver?)` decorator + guard: extracts the
   incoming bearer, resolves the resource (and optionally the resource's stored zookie) from the
   request, calls `client.check`, and enforces — `permit` ⇒ allow; `deny` with `unauthenticated`
   ⇒ 401; any other `deny` ⇒ 403; `pdp_unavailable` ⇒ **503** (fail-closed but **retryable**,
   consistent with the endpoint's own 503 on a PDP/store error). This is the remote twin of the
   in-process guard's `catch → deny`.

4. **Where the types live.** The **`@accesscore/contracts` package owns the wire DTO** — the
   `CheckRequest` shape (`action`, `resource {type,id}`, `consistencyToken`), the `Decision` /
   `Reason` / `Effect` response types, and the reserved reason-code constants. The API controller
   (today `check.dto.ts` + `authz/domain/decision.ts`) imports them, and the **SDK bundles them
   into its published declaration output** (tsup/rollup) so `@diegowritescode/accesscore-sdk` ships
   **zero workspace dependencies**; `@accesscore/contracts` stays an internal workspace package.
   The contract is defined once either way. **Domain types stay API-internal** (`Principal`, `EntityRef`,
   `TupleIndex`, the evaluator) — they must never cross the wire, precisely because subject/org
   are server-derived ([ADR-008](008-pdp-trust-model.md)). The Zod schema (runtime validation)
   may be exported from `contracts` or kept API-side; the domain `Decision` is projected to the
   DTO at the controller edge.

5. **Consistency ([ADR-004](004-authorization-consistency-model.md)).** The SDK threads the
   zookie: `consistencyToken` maps to the wire `consistency_token` ("evaluate against data at
   least as fresh as this revision"). **Resources store the zookie of their last ACL/content
   change**; the downstream service reads that stored token and passes it, which is the
   cross-actor-safe pattern. **Omitting it defaults to full consistency** — the strongest, safest
   default, matching the endpoint. Bounded-staleness remains an explicit, audited opt-in. Both
   PEPs thread the token identically; the shared contract keeps them aligned as the in-process
   guard (today `mode: 'full'`) grows a zookie hook.

6. **Machine / async on-behalf-of — deferred to the machine ring, seam defined now.** With no
   end-user token, [ADR-008](008-pdp-trust-model.md) forbids asserting a subject. The real answer
   is a **machine-minted, downscoped token** (RFC 8693 token exchange): the service authenticates
   as itself (a service account, Ring 1) and exchanges for a token that _AccessCore_ signs
   asserting subject X — not forgeable, so [ADR-008](008-pdp-trust-model.md)-safe. The elegant
   consequence of a **provenance-based** contract is that this is **purely additive**: a
   machine-minted token is still "a token AccessCore verifies," so it flows through the **same**
   `/authz/check` and the **same** `client.check(action, resource, { token })` — only the
   _token-acquisition_ step is new (a future `client.exchangeToken(...)` / machine-credentials
   config). The check contract does not change. Service-acting-on-its-own-behalf is the same shape
   with a machine subject (`service:eventbridge`). **Until the ring lands**, an async flow must
   either carry a still-live end-user token on the message envelope (bounded by the short access-
   token TTL, [ADR-003](003-token-and-session-strategy.md) — so unfit for long-running work) or
   **wait for the machine ring**; a consumer with no verifiable token **fails closed**.

7. **Interaction with [ADR-011](011-pdp-core-location.md).** A published SDK that runs checks
   **remotely needs no local evaluator** — it forwards to the API, which owns tuples, revisions,
   and the pure core ([ADR-012](012-pdp-evaluation-algorithm.md)). Therefore **publishing this
   SDK is NOT the [ADR-011](011-pdp-core-location.md) trigger** to extract
   `@accesscore/policy-engine`; that package stays a stub. It would become the trigger only if the
   SDK gained **client-side / offline evaluation** (embedded PDP over cached tuples, edge
   decisions) — a genuine second consumer of the pure core. v1 SDK is remote-only, so the trigger
   is not pulled.

The v1 SDK surfaces `check`; `expand` and `batchCheck` ([ADR-002](002-authorization-model.md))
are additive later over the same client and are out of scope here.

## Consequences

### Positive

- **Ships now on what exists.** Option (a) is "wrap the current endpoint"; the SDK is a thin
  client + guard, buildable by one developer, and unblocks every downstream spine service.
- **[ADR-008](008-pdp-trust-model.md) holds by construction, not by discipline.** The wire DTO
  has no subject/org field; a downstream PEP physically cannot assert identity. Both PEPs share
  the one server-side-provenance contract.
- **Forward-compatible seam.** Because the contract keys on _verified token_, the machine ring
  (RFC 8693) slots into the same endpoint and same `check` call with **zero contract change** —
  only token acquisition is added. We commit to the interface without pre-building the ring.
- **Fail-closed everywhere.** The client normalizes failures to `deny`; the guard mirrors the
  in-process `catch → deny`. A network partition denies rather than opens.
- **Contract defined once.** `@accesscore/contracts` removes DTO drift between the API and SDK;
  domain internals never leak onto the wire.
- **No premature extraction.** Remote checks keep `@accesscore/policy-engine` a stub, honoring
  [ADR-011](011-pdp-core-location.md)'s trigger.

### Negative / costs

- **Requires the user's token in the call chain.** Async/background authorization has no user
  token: those flows must carry a live (short-TTL) token on the envelope or wait for the machine
  ring. This is the explicit limitation of choosing (a) for v1.
- **Token-forwarding hands every downstream PEP a live bearer** it could replay elsewhere. The
  mitigation — per-service `aud` scoping and downscoped exchange tokens
  ([ADR-003](003-token-and-session-strategy.md) confused-deputy note) — is Ring 1. A low-trust
  service could replay a forwarded token to the check endpoint (it yields only _decisions_, not
  access), an accepted v1 exposure.
- **A network hop per remote check** (latency, availability coupling on the PDP), versus the
  in-process guard's direct call. Mitigated by short timeouts, fail-closed, and the
  [ADR-004](004-authorization-consistency-model.md) caching the API already plans.
- **Packaging (decided).** The public SDK cannot ship a `workspace:*` dependency on the private
  `@accesscore/contracts` at publish time, so the SDK **bundles the wire types into its declaration
  output** (tsup/rollup) and ships **zero workspace dependencies**; `@accesscore/contracts` stays an
  internal, unpublished workspace package. Avoids versioning/publishing a second public package.
- **Two guards to keep in lockstep.** The in-process and SDK `@RequirePermission` must evolve
  together (resolver shape, zookie threading, reason→status mapping). Shared `contracts` types and
  a shared conformance test suite are the mitigation.

## Alternatives considered

- **(b) Service-account + on-behalf-of / delegated assertion as the v1 default** — rejected for
  now: the only [ADR-008](008-pdp-trust-model.md)-safe form needs a non-forgeable trust mechanism
  (signed delegation or RFC 8693 token exchange), i.e. the machine ring
  ([ADR-003](003-token-and-session-strategy.md), Ring 1). Building it now is premature for a
  user-in-the-loop v1 and would front-load the hardest identity work before any downstream service
  needs async authz. Adopted as the deferred path in Decision §6, with the seam preserved.
- **Caller-asserted subject/org (a trusted `X-Subject` / `X-Org` header from the PEP)** — rejected
  outright: this is exactly the forgeable-oracle hole [ADR-008](008-pdp-trust-model.md) closed. Any
  compromised or buggy downstream could authorize as anyone.
- **A gateway/mesh that injects a verified identity header** — deferred: viable when a trusted
  edge (mTLS mesh, API gateway) is the _only_ path to the PDP, but it moves verification into infra
  we do not run at this scale and re-opens the header-trust question without that guarantee. Not a
  modular-monolith v1 concern.
- **Opaque tokens + AccessCore introspection on every check** — rejected as default (latency,
  coupling), consistent with [ADR-003](003-token-and-session-strategy.md); retained there as an
  option for high-sensitivity verifiers.
- **No `contracts` package; SDK re-declares the DTO** — rejected: guarantees drift between API and
  SDK on a security-critical contract. The package exists precisely to hold the wire types once.
- **SDK does client-side/offline evaluation now (bundle the evaluator)** — rejected: that _is_ the
  [ADR-011](011-pdp-core-location.md) extraction trigger and a far larger surface (ship tuples,
  revisions, consistency to the edge). Remote check is the honest v1; offline eval is a future ring
  and the documented moment `@accesscore/policy-engine` gets extracted.
