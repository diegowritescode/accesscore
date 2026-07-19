export interface SecretEncryptor {
  encrypt(plaintext: Uint8Array): Promise<string>;
  decrypt(ciphertext: string): Promise<Uint8Array>;
}

export const SECRET_ENCRYPTOR = Symbol('SECRET_ENCRYPTOR');
