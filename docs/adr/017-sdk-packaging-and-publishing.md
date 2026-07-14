# ADR-017: SDK packaging & publishing — tsup bundle to npmjs public

- **Status:** Proposed (2026-07-14)
- **Date:** 2026-07-14
- Executes the packaging deferral recorded in
  [ADR-013](013-cross-service-authorization-contract.md) §Consequences ("Packaging (decided)"):
  it turns `@diegowritescode/accesscore-sdk` from a `0.0.0`, `tsc`-built, `workspace:*`-linked stub
  into a `0.1.0` package a **separate repo** (MiniLedger, then the rest of the spine) can install
  from a clean clone with **no registry token**.

## Context

[ADR-013](013-cross-service-authorization-contract.md) settled _what_ the SDK is — a thin,
fail-closed `check` client plus a NestJS PEP (`AccessCoreModule` / `AccessCorePermissionGuard` /
`@RequirePermission`) — and _where the wire types live_: `@accesscore/contracts`, a **private**,
zero-runtime-dependency workspace package of pure types + `REASON_CODES`, imported by both the API
and the SDK so the contract is defined once. It explicitly deferred _how the SDK ships_, committing
only to the shape of the answer: "the SDK **bundles the wire types** into its published output and
ships **zero workspace dependencies**; `@accesscore/contracts` stays internal and unpublished."

Three facts force this ADR now:

1. **A `workspace:*` dependency is uninstallable off the monorepo.** `@accesscore/contracts` is
   `private: true` and never published. As long as the SDK's `package.json` carries
   `"@accesscore/contracts": "workspace:*"` as a runtime dependency, `npm install
@diegowritescode/accesscore-sdk` in MiniLedger fails — there is no such thing to resolve.
2. **`tsc` emits, it does not bundle.** The current `tsc -p tsconfig.json` build leaves
   `require('@accesscore/contracts')` in the JS and `from '@accesscore/contracts'` in the `.d.ts`,
   so even with the manifest fixed the _artifact_ still points at a package no consumer has.
3. **The portfolio's guarantee is "clone → `docker compose up` → it runs."** A consumer of the SDK
   must not need credentials to `npm ci`. The registry choice must preserve that.

The inherited invariants are not re-decided: the SDK is remote-only (it forwards to the API and
needs **no** local evaluator, so publishing it does **not** trigger the
[ADR-011](011-pdp-core-location.md) `@accesscore/policy-engine` extraction), fail-closed
([ADR-013](013-cross-service-authorization-contract.md)), and NestJS is an _optional_ dependency —
a plain client consumer must not be forced to install Nest.

## Decision

**Bundle the contract into the SDK with tsup (dual ESM+CJS, inlined types, Nest kept external as an
optional peer), and publish to the public npmjs registry. Bump `0.0.0 → 0.1.0`.**

### 1. tsup replaces tsc; contract is inlined, Nest stays a peer

`packages/sdk/tsup.config.ts` builds `src/index.ts` to `dist/` as **both** ESM (`index.js`) and
CJS (`index.cjs`) with declarations (`index.d.ts` / `index.d.cts`) and sourcemaps:

- **`noExternal: ['@accesscore/contracts']`** inlines the contract's _JavaScript_ (`REASON_CODES`)
  into every entrypoint; **`dts: { resolve: ['@accesscore/contracts'] }`** inlines its _type
  declarations_ so `Decision`, `ResourceRef`, `Effect`, `Reason`, `ReasonCode`, `CheckRequest`
  appear literally in `index.d.ts`. (Plain `dts: true` does **not** follow the re-export — it leaves
  `export … from '@accesscore/contracts'` in the `.d.ts`, which is uninstallable for a consumer;
  `resolve` is the operative option, and is why the design commitment "bundle the declarations" is
  met in practice, not just in intent.)
- **`external: ['@nestjs/common', '@nestjs/core', 'reflect-metadata']`** keeps NestJS out of the
  bundle. They remain **optional `peerDependencies`** (`peerDependenciesMeta … optional: true`), so a
  client-only consumer installs nothing Nest-related and a Nest consumer dedupes against its own copy.
- **`@swc/core`** is a devDependency so tsup emits `emitDecoratorMetadata` (esbuild alone drops it).
  Without it, `AccessCorePermissionGuard`'s constructor injection of `Reflector` **by type** has no
  `design:paramtypes` and fails at DI time in a consumer — a silent, runtime-only break. This is a
  correctness requirement, not an optimization.
- **`sourcesContent: false`** on the esbuild pass keeps `sourcemap: true` while ensuring the emitted
  `dist` (maps included) embeds no workspace-internal source text — the published tree references
  `@accesscore/contracts` in **zero** files.

### 2. The manifest ships zero runtime workspace dependencies

`@accesscore/contracts` moves from `dependencies` to **`devDependencies`** (still `workspace:*`):
the monorepo source resolves it at build time via the workspace link, but the _published_ manifest
has **no runtime `@accesscore/*` dependency** (`dependencies` is empty). It survives only as an inert
`devDependency` — never installed transitively by a consumer, so the clean-clone guarantee holds. The
manifest declares `main` (CJS), `module` (ESM), `types`, and a conditional `exports` map
(`import → dist/index.js`, `require → dist/index.cjs`, `types → dist/index.d.ts`); `type: "module"`
makes the `.js`/`.cjs` split resolve correctly at runtime. `files: ["dist"]` plus an in-package
`LICENSE` are the only publish payload.

### 3. Registry: npmjs public (not GitHub Packages)

The SDK publishes to **npmjs with `publishConfig.access: "public"`**; the previous
`registry: "https://npm.pkg.github.com"` override is **removed** so installs default to npmjs. The
decisive reason is the clean-clone guarantee: **GitHub Packages requires authentication even to
_read_ a public package** — a consumer's `npm ci` would need a `//npm.pkg.github.com/:_authToken` in
`.npmrc`, breaking "clone and it runs" for anyone without a GitHub token. npmjs public needs a token
only to **publish**, never to install.

### 4. Version 0.1.0 — `check` + PEP only

`0.0.0 → 0.1.0` (minor): the first releasable surface is `createClient().check` and the NestJS PEP.
`expand` and `batchCheck` ([ADR-002](002-authorization-model.md)) are additive over the same client
and are **excluded** from this release, consistent with
[ADR-013](013-cross-service-authorization-contract.md) scoping them out of v1. The bump is driven
through the repo's Changesets flow so a `CHANGELOG.md` is generated alongside it.

### 5. CI publishes on a GitHub Release; a token is the only secret

`.github/workflows/publish-sdk.yml` triggers on `release: [published]` (plus `workflow_dispatch`):
`pnpm/action-setup`, `actions/setup-node@v4` with `registry-url: https://registry.npmjs.org`,
`pnpm install --frozen-lockfile`, `pnpm --filter @diegowritescode/accesscore-sdk build`, then
`pnpm publish` (which rewrites the `workspace:*` protocol, unlike `npm publish`) with
`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`. Publishing is the _only_ step that needs a secret.

### 6. A publish-guard regression test

`packages/sdk/src/packaging.spec.ts` runs in `pnpm --filter …sdk test` and, against the built
`dist`, asserts: (a) the manifest declares **no** `@accesscore/*` runtime `dependencies`; (b)
**neither** `dist/index.js` **nor** `dist/index.cjs` contains the string `@accesscore/contracts`;
and (c) the CJS bundle loads and re-exports the inlined contract values (`REASON_CODES`) and the
client/module surface. It is the standing guard that a future refactor cannot silently reintroduce a
workspace dependency into the published bundle.

## Consequences

### Positive

- **Installs with no token, from a clean clone.** MiniLedger and the rest of the spine `npm ci` the
  SDK from npmjs with zero credentials — the portfolio's core guarantee, preserved.
- **Zero runtime workspace deps, by construction and by test.** The contract is inlined in JS _and_
  `.d.ts`; the manifest's `dependencies` is empty; the guard test fails the build if that regresses.
- **One contract, still defined once.** `@accesscore/contracts` stays the single internal source of
  the wire types; bundling copies it into the artifact without publishing a second package or forking
  the definition.
- **Dual ESM/CJS with correct types per module system**, and NestJS stays optional — a client-only
  consumer pulls no framework.
- **No premature extraction.** Remote-only checks keep `@accesscore/policy-engine` a stub, honoring
  [ADR-011](011-pdp-core-location.md)'s trigger.

### Negative / costs

- **`@accesscore/contracts` lingers in the published `devDependencies`** (rewritten to a concrete
  version at pack time). It is never installed by consumers, but the manifest is not _literally_
  free of the name. Fully stripping it would need a `prepack` rewrite — rejected as over-engineering
  for an inert field.
- **A heavier toolchain than `tsc`** (tsup + esbuild + `@swc/core` for decorator metadata). The
  metadata requirement in particular is a sharp edge: an esbuild-only bundle _builds_ but breaks Nest
  DI at runtime. Covered by the ADR and the SDK's Nest spec.
- **Two declaration files** (`index.d.ts` / `index.d.cts`) and `type: "module"` mean the CJS/ESM
  split must stay coherent with the `exports` map; a wrong entry is a consumer-facing resolution bug.
  The dual-format build and the guard test exercise both.
- **Sourcemaps ship without embedded source** (`sourcesContent: false`), so a consumer's debugger
  maps to positions but not to original text. Accepted: the source is not published, and keeping the
  `dist` free of workspace source text is the higher priority.
- **A second published npmjs package to own** (naming, deprecation, provenance) versus keeping the
  SDK monorepo-internal — the unavoidable cost of letting a separate repo consume it.

## Alternatives considered

- **GitHub Packages instead of npmjs** — rejected. GHP requires a token to install _even public_
  packages, so every consumer's `npm ci` would need `.npmrc` auth, breaking the clean-clone
  guarantee. npmjs public needs a token only to publish. This is the pivotal trade-off and the reason
  the pre-existing `registry` override is removed.
- **Publish a second public `@accesscore/contracts`** so the SDK can keep a normal runtime dependency
  — rejected. It doubles the release/versioning surface for a package that is pure types, and
  [ADR-013](013-cross-service-authorization-contract.md) already chose bundling precisely to avoid
  versioning a second public package. Inlining keeps one internal source of truth.
- **Keep `tsc` + `workspace:*`** — rejected: the artifact is uninstallable off the monorepo (both the
  manifest dependency and the emitted `require`/`import` point at an unpublished private package).
- **esbuild/tsup without `@swc/core`** — rejected: it silently drops `emitDecoratorMetadata`, so the
  Nest guard's type-based `Reflector` injection fails at DI time in a consumer. Correctness, not size.
- **ESM-only (or CJS-only) output** — rejected for v1: the spine mixes module systems (NestJS apps are
  effectively CJS today), and a single format would force a consumer's toolchain to interop-shim the
  SDK. Dual output with a conditional `exports` map is the low-friction default.
- **`npm publish` in the workflow** — rejected in favor of `pnpm publish`: run outside an npm
  workspace, `npm publish` does not rewrite the `workspace:*` protocol and would emit an invalid
  manifest; `pnpm publish` rewrites it to a concrete version.
