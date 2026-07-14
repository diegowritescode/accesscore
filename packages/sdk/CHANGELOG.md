# @diegowritescode/accesscore-sdk

## 0.1.0

### Minor Changes

- Package the SDK for external consumption and publish it to the public npmjs registry.

  The build switches from `tsc` to `tsup`, emitting dual ESM (`dist/index.js`) and CommonJS
  (`dist/index.cjs`) bundles with inlined type declarations. The `@accesscore/contracts` wire types
  are bundled directly into the artifact, so the published package carries zero workspace runtime
  dependencies and installs with no registry token. NestJS remains an optional peer dependency, and
  `createClient().check` plus the NestJS PEP (`AccessCoreModule`, `AccessCorePermissionGuard`,
  `@RequirePermission`) are the released surface.
