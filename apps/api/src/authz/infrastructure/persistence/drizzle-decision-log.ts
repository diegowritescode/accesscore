import { type Database } from '../../../db/db.module';
import { type DecisionLogRecord, type DecisionLogSink } from '../../domain/ports/decision-log';
import { decisionLog } from './schema';

export class DrizzleDecisionLog implements DecisionLogSink {
  constructor(private readonly db: Database) {}

  async recordBatch(entries: readonly DecisionLogRecord[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    await this.db.insert(decisionLog).values(
      entries.map((entry) => ({
        id: entry.id,
        orgId: entry.orgId ? entry.orgId.value : null,
        subject: entry.subject,
        action: entry.action,
        resource: entry.resource,
        effect: entry.effect,
        reasons: [...entry.reasons],
        revisionUsed: entry.revisionUsed.value,
        latencyMs: entry.latencyMs,
        createdAt: entry.createdAt,
      })),
    );
  }
}
