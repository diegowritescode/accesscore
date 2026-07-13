import { type Database } from '../../../db/db.module';
import { type DecisionLog, type DecisionLogRecord } from '../../domain/ports/decision-log';
import { decisionLog } from './schema';

export class DrizzleDecisionLog implements DecisionLog {
  constructor(private readonly db: Database) {}

  async record(entry: DecisionLogRecord): Promise<void> {
    await this.db.insert(decisionLog).values({
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
    });
  }
}
