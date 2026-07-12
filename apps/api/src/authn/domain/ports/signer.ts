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
}

export interface Signer {
  sign(payload: Uint8Array): Promise<Signature>;
  verify(payload: Uint8Array, signature: Signature): Promise<boolean>;
  publicKeys(): Promise<PublicKey[]>;
}

export const SIGNER = Symbol('SIGNER');
