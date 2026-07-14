import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { AccessCoreClient, Decision, ReasonCode, ResourceRef } from '../dist/index';

const sdkRoot = join(__dirname, '..');
const distDir = join(sdkRoot, 'dist');
const manifestPath = join(sdkRoot, 'package.json');
const loadBundle = createRequire(__filename);

interface Manifest {
  readonly dependencies?: Record<string, string>;
}

interface SdkBundle {
  createClient(config: { baseUrl: string }): AccessCoreClient;
  REASON_CODES: Record<string, ReasonCode>;
  AccessCoreModule: { forRoot(config: { baseUrl: string }): unknown };
}

describe('published SDK is self-contained', () => {
  beforeAll(() => {
    if (!existsSync(join(distDir, 'index.js')) || !existsSync(join(distDir, 'index.cjs'))) {
      throw new Error('SDK dist is missing; build the package before running this spec.');
    }
  });

  it('declares no runtime dependency on an @accesscore/* workspace package', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
    const workspaceDeps = Object.keys(manifest.dependencies ?? {}).filter((name) =>
      name.startsWith('@accesscore/'),
    );
    expect(workspaceDeps).toEqual([]);
  });

  it('inlines @accesscore/contracts into every built entrypoint', () => {
    for (const file of ['index.js', 'index.cjs']) {
      expect(readFileSync(join(distDir, file), 'utf8')).not.toContain('@accesscore/contracts');
    }
  });

  it('loads from the built bundle with contract types and values inlined', () => {
    const bundle = loadBundle(join(distDir, 'index.cjs')) as SdkBundle;
    const resource: ResourceRef = { type: 'ledger', id: 'l-1' };
    const client: AccessCoreClient = bundle.createClient({ baseUrl: 'http://pdp.test' });
    const seed: Decision = { effect: 'deny', reasons: [] };

    expect(typeof client.check).toBe('function');
    expect(bundle.REASON_CODES.PDP_UNAVAILABLE).toBe('pdp_unavailable');
    expect(typeof bundle.AccessCoreModule.forRoot).toBe('function');
    expect(resource.type).toBe('ledger');
    expect(seed.effect).toBe('deny');
  });
});
