export type SigningAlg = 'EdDSA';

export interface Signature {
  kid: string;
  alg: SigningAlg;
  value: string;
}

export interface PublicKey {
  kid: string;
  alg: SigningAlg;
  key: Uint8Array;
  version: number;
}

export interface Signer {
  sign(payload: Uint8Array, keyVersion?: number): Promise<Signature>;
  verify(payload: Uint8Array, signature: Signature): Promise<boolean>;
  publicKeys(): Promise<PublicKey[]>;
  latestVersion(): Promise<number>;
  kidFor(version: number): string;
  rotate(): Promise<void>;
  setMinDecryptionVersion(version: number): Promise<void>;
}

export const SIGNER = Symbol('SIGNER');
