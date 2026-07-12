import {
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';
import { type PublicKey, type Signature, type Signer } from '../../domain/ports/signer';

export class SoftwareSigner implements Signer {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly rawPublicKey: Uint8Array;

  constructor(private readonly kid: string = 'software-1') {
    const pair = generateKeyPairSync('ed25519');
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey;
    const jwk = this.publicKey.export({ format: 'jwk' });
    if (typeof jwk.x !== 'string') {
      throw new Error('failed to export Ed25519 public key');
    }
    this.rawPublicKey = new Uint8Array(Buffer.from(jwk.x, 'base64url'));
  }

  async sign(payload: Uint8Array): Promise<Signature> {
    const value = cryptoSign(null, payload, this.privateKey).toString('base64url');
    return { kid: this.kid, alg: 'EdDSA', value };
  }

  async verify(payload: Uint8Array, signature: Signature): Promise<boolean> {
    if (signature.kid !== this.kid || signature.alg !== 'EdDSA') return false;
    return cryptoVerify(null, payload, this.publicKey, Buffer.from(signature.value, 'base64url'));
  }

  async publicKeys(): Promise<PublicKey[]> {
    return [{ kid: this.kid, alg: 'EdDSA', key: this.rawPublicKey, version: 1 }];
  }

  latestVersion(): Promise<number> {
    return Promise.resolve(1);
  }

  kidFor(_version: number): string {
    return this.kid;
  }

  rotate(): Promise<void> {
    return Promise.reject(new Error('rotation not supported by the software signer'));
  }

  setMinDecryptionVersion(): Promise<void> {
    return Promise.reject(new Error('rotation not supported by the software signer'));
  }
}
