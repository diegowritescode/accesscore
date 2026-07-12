import { eq } from 'drizzle-orm';
import { type Database } from '../../../db/db.module';
import { appMeta } from '../../../db/schema';
import {
  type SigningKeyState,
  type SigningKeyStateDoc,
} from '../../domain/ports/signing-key-state';

const KEY = 'authn:signing_key_state';

export class AppMetaSigningKeyState implements SigningKeyState {
  constructor(private readonly db: Database) {}

  async read(): Promise<SigningKeyStateDoc> {
    const rows = await this.db.select().from(appMeta).where(eq(appMeta.key, KEY)).limit(1);
    const row = rows[0];
    if (!row) {
      return { pinnedVersion: null, retiring: [] };
    }
    return JSON.parse(row.value) as SigningKeyStateDoc;
  }

  async write(doc: SigningKeyStateDoc): Promise<void> {
    const value = JSON.stringify(doc);
    await this.db
      .insert(appMeta)
      .values({ key: KEY, value })
      .onConflictDoUpdate({ target: appMeta.key, set: { value, updatedAt: new Date() } });
  }
}
