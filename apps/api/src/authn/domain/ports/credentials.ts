export interface CredentialCheck {
  userId: string;
  aal: number;
}

export interface Credentials {
  verify(email: string, password: string): Promise<CredentialCheck | null>;
}

export const CREDENTIALS = Symbol('CREDENTIALS');
