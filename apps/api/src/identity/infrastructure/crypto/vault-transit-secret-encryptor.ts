import { type SecretEncryptor } from '../../domain/ports/secret-encryptor';

export interface VaultTransitSecretEncryptorConfig {
  addr: string;
  token: string;
  keyName: string;
}

export class VaultTransitSecretEncryptor implements SecretEncryptor {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly keyName: string;
  private ready: Promise<void> | null = null;

  constructor(config: VaultTransitSecretEncryptorConfig) {
    this.baseUrl = config.addr.replace(/\/+$/, '');
    this.token = config.token;
    this.keyName = config.keyName;
  }

  async encrypt(plaintext: Uint8Array): Promise<string> {
    await this.ensureKey();
    const body = await this.request<{ data: { ciphertext: string } }>(
      'POST',
      `transit/encrypt/${this.keyName}`,
      { plaintext: Buffer.from(plaintext).toString('base64') },
    );
    return body.data.ciphertext;
  }

  async decrypt(ciphertext: string): Promise<Uint8Array> {
    const body = await this.request<{ data: { plaintext: string } }>(
      'POST',
      `transit/decrypt/${this.keyName}`,
      { ciphertext },
    );
    return new Uint8Array(Buffer.from(body.data.plaintext, 'base64'));
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
    await this.request('POST', `transit/keys/${this.keyName}`, { type: 'aes256-gcm96' });
  }

  private async mountTransit(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/sys/mounts/transit`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ type: 'transit' }),
    });
    if (res.ok || res.status === 400) {
      return;
    }
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
