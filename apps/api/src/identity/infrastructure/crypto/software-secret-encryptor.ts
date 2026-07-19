import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { type SecretEncryptor } from '../../domain/ports/secret-encryptor';

const PREFIX = 'sw:v1';

export class SoftwareSecretEncryptor implements SecretEncryptor {
  private readonly key: Buffer;

  constructor(key: Buffer = randomBytes(32)) {
    this.key = key;
  }

  async encrypt(plaintext: Uint8Array): Promise<string> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
  }

  async decrypt(ciphertext: string): Promise<Uint8Array> {
    const [prefix, version, ivPart, tagPart, dataPart] = ciphertext.split(':');
    if (`${prefix}:${version}` !== PREFIX || !ivPart || !tagPart || !dataPart) {
      throw new Error('malformed software-encrypted secret');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]);
    return new Uint8Array(plaintext);
  }
}
