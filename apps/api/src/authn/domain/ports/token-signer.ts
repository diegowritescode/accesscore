import { type Signature } from './signer';

export interface ActiveKey {
  version: number;
  kid: string;
}

export interface TokenSigner {
  resolveActive(): Promise<ActiveKey>;
  sign(payload: Uint8Array, version: number): Promise<Signature>;
}

export const TOKEN_SIGNER = Symbol('TOKEN_SIGNER');
