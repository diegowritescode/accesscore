import { Logger } from '@nestjs/common';
import { type MetricsService } from '../../../observability/metrics.service';
import { type Clock } from '../../../shared/kernel/clock';
import {
  type DecisionLog,
  type DecisionLogRecord,
  type DecisionLogSink,
} from '../../domain/ports/decision-log';

export const DECISION_LOG_WRITER = Symbol('DECISION_LOG_WRITER');

export interface FlushableDecisionLog extends DecisionLog {
  flush(): Promise<void>;
  close(): Promise<void>;
}

export interface DecisionLogBufferOptions {
  readonly maxBufferSize: number;
  readonly flushBatchSize: number;
  readonly flushIntervalMs: number;
}

export class BufferedDecisionLog implements FlushableDecisionLog {
  private readonly logger = new Logger('DecisionLog');
  private readonly buffer: DecisionLogRecord[] = [];
  private readonly timer: NodeJS.Timeout;
  private flushing: Promise<void> | null = null;

  constructor(
    private readonly sink: DecisionLogSink,
    private readonly metrics: MetricsService,
    private readonly clock: Clock,
    private readonly options: DecisionLogBufferOptions,
  ) {
    this.timer = setInterval(() => void this.flush(), options.flushIntervalMs);
    this.timer.unref();
  }

  async record(entry: DecisionLogRecord): Promise<void> {
    if (this.buffer.length >= this.options.maxBufferSize) {
      this.metrics.observeDecisionLogRecords('degraded', 1);
      await this.sink.recordBatch([entry]);
      return;
    }
    this.buffer.push(entry);
    this.metrics.setDecisionLogBufferDepth(this.buffer.length);
    if (this.buffer.length >= this.options.flushBatchSize) {
      void this.flush();
    }
  }

  flush(): Promise<void> {
    this.flushing ??= this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    do {
      await this.flush();
    } while (this.buffer.length > 0);
  }

  private async drain(): Promise<void> {
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, this.options.flushBatchSize);
      this.metrics.setDecisionLogBufferDepth(this.buffer.length);
      this.metrics.observeDecisionLogFlushLag(this.lagSecondsOf(batch));
      try {
        await this.sink.recordBatch(batch);
        this.metrics.observeDecisionLogRecords('flushed', batch.length);
      } catch (error) {
        this.logger.error(
          `decision log flush failed; ${batch.length} entries dropped`,
          error as Error,
        );
        this.metrics.observeDecisionLogRecords('dropped', batch.length);
      }
    }
  }

  private lagSecondsOf(batch: readonly DecisionLogRecord[]): number {
    const now = this.clock.now().getTime();
    const oldest = batch.reduce((min, entry) => Math.min(min, entry.createdAt.getTime()), now);
    return (now - oldest) / 1000;
  }
}

export class ImmediateDecisionLog implements FlushableDecisionLog {
  constructor(private readonly sink: DecisionLogSink) {}

  async record(entry: DecisionLogRecord): Promise<void> {
    await this.sink.recordBatch([entry]);
  }

  async flush(): Promise<void> {
    return undefined;
  }

  async close(): Promise<void> {
    return undefined;
  }
}
