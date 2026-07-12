import { type Clock } from '../domain/ports/clock';
import { type Signature, type Signer } from '../domain/ports/signer';
import { type SigningKeyState } from '../domain/ports/signing-key-state';
import { type ActiveKey, type TokenSigner } from '../domain/ports/token-signer';

export interface SigningKeysConfig {
  accessTokenTtlSeconds: number;
}

export const SIGNING_KEYS = Symbol('SIGNING_KEYS');

export class SigningKeyService implements TokenSigner {
  constructor(
    private readonly signer: Signer,
    private readonly state: SigningKeyState,
    private readonly clock: Clock,
    private readonly config: SigningKeysConfig,
  ) {}

  async resolveActive(): Promise<ActiveKey> {
    const doc = await this.state.read();
    const version = doc.pinnedVersion ?? (await this.signer.latestVersion());
    return { version, kid: this.signer.kidFor(version) };
  }

  sign(payload: Uint8Array, version: number): Promise<Signature> {
    return this.signer.sign(payload, version);
  }

  async rotate(): Promise<void> {
    const active = await this.resolveActive();
    await this.signer.rotate();
    const doc = await this.state.read();
    await this.state.write({ ...doc, pinnedVersion: active.version });
  }

  async promote(): Promise<void> {
    const doc = await this.state.read();
    const previous = doc.pinnedVersion ?? (await this.signer.latestVersion());
    const latest = await this.signer.latestVersion();
    if (latest <= previous) {
      await this.state.write({ ...doc, pinnedVersion: null });
      return;
    }
    const drainUntilMs = this.clock.now().getTime() + this.config.accessTokenTtlSeconds * 1000;
    await this.state.write({
      pinnedVersion: null,
      retiring: [
        ...doc.retiring.filter((entry) => entry.version !== previous),
        { version: previous, drainUntilMs },
      ],
    });
  }

  async retire(): Promise<number[]> {
    const doc = await this.state.read();
    const nowMs = this.clock.now().getTime();
    const drained = doc.retiring.filter((entry) => entry.drainUntilMs <= nowMs);
    if (drained.length === 0) {
      return [];
    }
    const target = Math.max(...drained.map((entry) => entry.version)) + 1;
    await this.signer.setMinDecryptionVersion(target);
    await this.state.write({
      ...doc,
      retiring: doc.retiring.filter((entry) => entry.drainUntilMs > nowMs),
    });
    return drained.map((entry) => entry.version);
  }
}
