import { and, eq } from 'drizzle-orm';
import { type Database } from '../../../db/db.module';
import { UserId } from '../../../shared/kernel/user-id';
import { MfaCredential, type MfaStatus, type MfaType } from '../../domain/mfa-credential';
import { type MfaCredentialsRepository } from '../../domain/ports/mfa-credentials-repository';
import { mfaCredentials } from './schema';

export class DrizzleMfaCredentialsRepository implements MfaCredentialsRepository {
  constructor(private readonly db: Database) {}

  async save(credential: MfaCredential): Promise<void> {
    await this.db
      .insert(mfaCredentials)
      .values({
        id: credential.id,
        userId: credential.userId.value,
        type: credential.type,
        status: credential.status,
        secretCiphertext: credential.secretCiphertext,
        algorithm: credential.algorithm,
        digits: credential.digits,
        period: credential.period,
        lastUsedStep: credential.lastUsedStep,
        createdAt: credential.createdAt,
        activatedAt: credential.activatedAt,
        revokedAt: credential.revokedAt,
      })
      .onConflictDoUpdate({
        target: mfaCredentials.id,
        set: {
          status: credential.status,
          secretCiphertext: credential.secretCiphertext,
          lastUsedStep: credential.lastUsedStep,
          activatedAt: credential.activatedAt,
          revokedAt: credential.revokedAt,
        },
      });
  }

  async findById(id: string): Promise<MfaCredential | null> {
    const rows = await this.db
      .select()
      .from(mfaCredentials)
      .where(eq(mfaCredentials.id, id))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findActiveTotpByUser(userId: UserId): Promise<MfaCredential | null> {
    return this.findByStatus(userId, 'active');
  }

  async findPendingTotpByUser(userId: UserId): Promise<MfaCredential | null> {
    return this.findByStatus(userId, 'pending');
  }

  private async findByStatus(userId: UserId, status: MfaStatus): Promise<MfaCredential | null> {
    const rows = await this.db
      .select()
      .from(mfaCredentials)
      .where(
        and(
          eq(mfaCredentials.userId, userId.value),
          eq(mfaCredentials.type, 'totp'),
          eq(mfaCredentials.status, status),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  private toDomain(row: typeof mfaCredentials.$inferSelect): MfaCredential {
    return MfaCredential.reconstitute({
      id: row.id,
      userId: UserId.fromString(row.userId),
      type: row.type as MfaType,
      status: row.status as MfaStatus,
      secretCiphertext: row.secretCiphertext,
      algorithm: row.algorithm,
      digits: row.digits,
      period: row.period,
      lastUsedStep: row.lastUsedStep,
      createdAt: row.createdAt,
      activatedAt: row.activatedAt,
      revokedAt: row.revokedAt,
    });
  }
}
