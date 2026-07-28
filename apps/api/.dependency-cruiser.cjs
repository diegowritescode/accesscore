/**
 * Architecture fitness functions.
 *
 * These rules are executable ADRs: they fail CI when an import crosses a
 * boundary that the hexagonal / DDD design (ADR-001) forbids. Layers point
 * inward only — interface -> application -> domain — and the domain stays a
 * pure, framework-free core. See docs/architecture.md.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Circular dependencies break modularity and make reasoning/testing local impossible.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-points-inward',
      comment:
        'Domain must not depend on application, infrastructure, or interface (any module). ' +
        'The domain is the center of the hexagon; dependencies point toward it, never out.',
      severity: 'error',
      from: { path: '^src/[^/]+/domain/' },
      to: { path: '^src/[^/]+/(application|infrastructure|interface)/' },
    },
    {
      name: 'domain-is-framework-free',
      comment:
        'Domain must have zero framework/ORM/library imports so it stays pure and unit-testable ' +
        '(Node core modules are allowed). If the domain needs a library, that is a design decision — ' +
        'wrap it behind a port in application/infrastructure instead.',
      severity: 'error',
      from: { path: '^src/[^/]+/domain/' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled'] },
    },
    {
      name: 'application-uses-ports-not-adapters',
      comment:
        'Application orchestrates through domain ports; it must never import an infrastructure adapter. ' +
        'Wiring concrete adapters to ports is the composition root/DI container job.',
      severity: 'error',
      from: { path: '^src/[^/]+/application/' },
      to: { path: '^src/[^/]+/infrastructure/' },
    },
    {
      name: 'application-not-interface',
      comment: 'Application is transport-agnostic; it must not depend on the HTTP/interface layer.',
      severity: 'error',
      from: { path: '^src/[^/]+/application/' },
      to: { path: '^src/[^/]+/interface/' },
    },
    {
      name: 'infrastructure-not-interface',
      comment: 'Adapters implement ports; they must not depend on controllers/guards.',
      severity: 'error',
      from: { path: '^src/[^/]+/infrastructure/' },
      to: { path: '^src/[^/]+/interface/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.spec\\.ts|\\.e2e-spec\\.ts)$|^src/.*\\.module\\.ts$|^src/main\\.ts$' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
