export interface RetiringKey {
  version: number;
  drainUntilMs: number;
}

export interface SigningKeyStateDoc {
  pinnedVersion: number | null;
  retiring: RetiringKey[];
}

export interface SigningKeyState {
  read(): Promise<SigningKeyStateDoc>;
  write(doc: SigningKeyStateDoc): Promise<void>;
}

export const SIGNING_KEY_STATE = Symbol('SIGNING_KEY_STATE');
