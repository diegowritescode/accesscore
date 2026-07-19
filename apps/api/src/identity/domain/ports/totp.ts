export interface TotpVerifyOptions {
  window: number;
  afterStep?: number;
}

export interface TotpVerification {
  valid: boolean;
  step: number;
}

export interface Totp {
  verify(secret: Uint8Array, code: string, at: Date, options: TotpVerifyOptions): TotpVerification;
}

export const TOTP = Symbol('TOTP');
