import { type DecisionLog, type DecisionLogRecord } from '../authz/domain/ports/decision-log';
import { MetricsService } from './metrics.service';

export class MeteredDecisionLog implements DecisionLog {
  constructor(
    private readonly inner: DecisionLog,
    private readonly metrics: MetricsService,
  ) {}

  async record(entry: DecisionLogRecord): Promise<void> {
    this.metrics.observeDecision(entry.effect, entry.latencyMs / 1000);
    await this.inner.record(entry);
  }
}
