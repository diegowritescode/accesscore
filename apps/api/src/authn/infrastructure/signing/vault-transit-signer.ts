import { type PublicKey, type Signature, type Signer } from '../../domain/ports/signer';

export interface VaultTransitSignerConfig {
  addr: string;
  token: string;
  keyName: string;
}

interface VaultKeyData {
  latest_version: number;
  min_decryption_version: number;
  keys: Record<string, { public_key: string }>;
}

const KID_VERSION = /-(\d+)$/;

export class VaultTransitSigner implements Signer {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly keyName: string;
  private ready: Promise<void> | null = null;

  constructor(config: VaultTransitSignerConfig) {
    this.baseUrl = config.addr.replace(/\/+$/, '');
    this.token = config.token;
    this.keyName = config.keyName;
  }

  kidFor(version: number): string {
    return `${this.keyName}-${version}`;
  }

  async sign(payload: Uint8Array, keyVersion?: number): Promise<Signature> {
    await this.ensureKey();
    const body = await this.request<{ data: { signature: string } }>(
      'POST',
      `transit/sign/${this.keyName}`,
      {
        input: Buffer.from(payload).toString('base64'),
        ...(keyVersion === undefined ? {} : { key_version: keyVersion }),
      },
    );
    const [, version, valueB64] = body.data.signature.split(':');
    if (!version || !valueB64) {
      throw new Error('unexpected Vault signature format');
    }
    return {
      kid: this.kidFor(Number(version.slice(1))),
      alg: 'EdDSA',
      value: Buffer.from(valueB64, 'base64').toString('base64url'),
    };
  }

  async verify(payload: Uint8Array, signature: Signature): Promise<boolean> {
    const version = KID_VERSION.exec(signature.kid)?.[1];
    if (!version || signature.alg !== 'EdDSA') return false;
    const vaultSignature = `vault:v${version}:${Buffer.from(signature.value, 'base64url').toString('base64')}`;
    const body = await this.request<{ data: { valid: boolean } }>(
      'POST',
      `transit/verify/${this.keyName}`,
      { input: Buffer.from(payload).toString('base64'), signature: vaultSignature },
    );
    return body.data.valid === true;
  }

  async publicKeys(): Promise<PublicKey[]> {
    await this.ensureKey();
    const body = await this.readKey();
    return Object.entries(body.data.keys)
      .map(([version, entry]) => ({
        version: Number(version),
        kid: this.kidFor(Number(version)),
        alg: 'EdDSA' as const,
        key: new Uint8Array(Buffer.from(entry.public_key, 'base64')),
      }))
      .sort((a, b) => b.version - a.version);
  }

  async latestVersion(): Promise<number> {
    await this.ensureKey();
    return (await this.readKey()).data.latest_version;
  }

  async rotate(): Promise<void> {
    await this.ensureKey();
    await this.request('POST', `transit/keys/${this.keyName}/rotate`);
  }

  async setMinDecryptionVersion(version: number): Promise<void> {
    await this.ensureKey();
    await this.request('POST', `transit/keys/${this.keyName}/config`, {
      min_decryption_version: version,
    });
  }

  private readKey(): Promise<{ data: VaultKeyData }> {
    return this.request<{ data: VaultKeyData }>('GET', `transit/keys/${this.keyName}`);
  }

  private ensureKey(): Promise<void> {
    if (!this.ready) {
      this.ready = this.bootstrap().catch((error: unknown) => {
        this.ready = null;
        throw error;
      });
    }
    return this.ready;
  }

  private async bootstrap(): Promise<void> {
    await this.mountTransit();
    await this.request('POST', `transit/keys/${this.keyName}`, { type: 'ed25519' });
  }

  private async mountTransit(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/sys/mounts/transit`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ type: 'transit' }),
    });
    if (res.ok || res.status === 400) return;
    throw new Error(`Vault mount transit failed: ${res.status} ${await res.text()}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}/v1/${path}`, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Vault request ${method} ${path} failed: ${res.status} ${text}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  private headers(): Record<string, string> {
    return { 'X-Vault-Token': this.token, 'Content-Type': 'application/json' };
  }
}
