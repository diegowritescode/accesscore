import { type PublicKey, type Signature, type Signer } from '../domain/ports/signer';
import { type SigningKeyState, type SigningKeyStateDoc } from '../domain/ports/signing-key-state';
import { SigningKeyService } from './signing-keys';

class FakeSigner implements Signer {
  latest = 1;
  minDecryption = 1;

  kidFor(version: number): string {
    return `k-${version}`;
  }

  sign(_payload: Uint8Array, keyVersion?: number): Promise<Signature> {
    const version = keyVersion ?? this.latest;
    return Promise.resolve({ kid: this.kidFor(version), alg: 'EdDSA', value: `sig-${version}` });
  }

  verify(): Promise<boolean> {
    return Promise.resolve(true);
  }

  publicKeys(): Promise<PublicKey[]> {
    const keys: PublicKey[] = [];
    for (let version = this.minDecryption; version <= this.latest; version += 1) {
      keys.push({ kid: this.kidFor(version), alg: 'EdDSA', key: new Uint8Array(32), version });
    }
    return Promise.resolve(keys.reverse());
  }

  latestVersion(): Promise<number> {
    return Promise.resolve(this.latest);
  }

  rotate(): Promise<void> {
    this.latest += 1;
    return Promise.resolve();
  }

  setMinDecryptionVersion(version: number): Promise<void> {
    this.minDecryption = version;
    return Promise.resolve();
  }
}

class MemoryState implements SigningKeyState {
  doc: SigningKeyStateDoc = { pinnedVersion: null, retiring: [] };
  read(): Promise<SigningKeyStateDoc> {
    return Promise.resolve({
      pinnedVersion: this.doc.pinnedVersion,
      retiring: [...this.doc.retiring],
    });
  }
  write(doc: SigningKeyStateDoc): Promise<void> {
    this.doc = doc;
    return Promise.resolve();
  }
}

const TTL = 900;

const setup = () => {
  const signer = new FakeSigner();
  const state = new MemoryState();
  let nowMs = Date.parse('2026-07-12T12:00:00.000Z');
  const service = new SigningKeyService(
    signer,
    state,
    { now: () => new Date(nowMs) },
    { accessTokenTtlSeconds: TTL },
  );
  return { signer, state, service, advance: (ms: number) => (nowMs += ms) };
};

describe('SigningKeyService', () => {
  it('resolves the latest version as active before any rotation', async () => {
    const { service } = setup();
    expect(await service.resolveActive()).toEqual({ version: 1, kid: 'k-1' });
  });

  it('publish-before-sign: rotate publishes a new version but keeps signing with the old one', async () => {
    const { signer, service } = setup();

    await service.rotate();

    expect(signer.latest).toBe(2);
    expect((await signer.publicKeys()).map((k) => k.version)).toEqual([2, 1]);
    expect(await service.resolveActive()).toEqual({ version: 1, kid: 'k-1' });
  });

  it('promote switches signing to the newest version and schedules the old one to drain', async () => {
    const { state, service } = setup();

    await service.rotate();
    await service.promote();

    expect(await service.resolveActive()).toEqual({ version: 2, kid: 'k-2' });
    expect(state.doc.pinnedVersion).toBeNull();
    expect(state.doc.retiring).toHaveLength(1);
    expect(state.doc.retiring[0]?.version).toBe(1);
  });

  it('retire-after-drain: does not retire until the drain window elapses', async () => {
    const { signer, service, advance } = setup();

    await service.rotate();
    await service.promote();

    expect(await service.retire()).toEqual([]);
    expect(signer.minDecryption).toBe(1);
    expect((await signer.publicKeys()).map((k) => k.version)).toEqual([2, 1]);

    advance(TTL * 1000 + 1);

    expect(await service.retire()).toEqual([1]);
    expect(signer.minDecryption).toBe(2);
    expect((await signer.publicKeys()).map((k) => k.version)).toEqual([2]);
  });
});
