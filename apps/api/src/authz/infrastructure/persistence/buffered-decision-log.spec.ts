import { MetricsService } from '../../../observability/metrics.service';
import { type Clock } from '../../../shared/kernel/clock';
import { OrgId } from '../../../shared/kernel/org-id';
import { Revision } from '../../../shared/kernel/revision';
import { type DecisionLogRecord, type DecisionLogSink } from '../../domain/ports/decision-log';
import {
  BufferedDecisionLog,
  type DecisionLogBufferOptions,
  ImmediateDecisionLog,
} from './buffered-decision-log';

const now = new Date('2026-07-30T00:00:00.000Z');
const clock: Clock = { now: () => now };

const entry = (overrides: Partial<DecisionLogRecord> = {}): DecisionLogRecord => ({
  id: 'd1',
  orgId: OrgId.fromString('11111111-1111-1111-1111-111111111111'),
  subject: 'user:alice',
  action: 'document.read',
  resource: 'document:onboarding',
  effect: 'permit',
  reasons: [],
  revisionUsed: Revision.fromValue(7),
  latencyMs: 3,
  createdAt: now,
  ...overrides,
});

interface RecordingSink extends DecisionLogSink {
  readonly batches: DecisionLogRecord[][];
}

const recordingSink = (): RecordingSink => {
  const batches: DecisionLogRecord[][] = [];
  return {
    batches,
    recordBatch: (entries) => {
      batches.push([...entries]);
      return Promise.resolve();
    },
  };
};

const options = (overrides: Partial<DecisionLogBufferOptions> = {}): DecisionLogBufferOptions => ({
  maxBufferSize: 100,
  flushBatchSize: 10,
  flushIntervalMs: 1000,
  ...overrides,
});

describe('BufferedDecisionLog', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
  });

  it('buffers a record without writing and flushes it as one batch', async () => {
    const sink = recordingSink();
    const log = new BufferedDecisionLog(sink, metrics, clock, options());

    await log.record(entry({ id: 'a' }));
    await log.record(entry({ id: 'b' }));
    expect(sink.batches).toHaveLength(0);

    await log.flush();

    expect(sink.batches).toHaveLength(1);
    expect(sink.batches[0]?.map((row) => row.id)).toEqual(['a', 'b']);
    await log.close();
  });

  it('flushes automatically once the batch-size trigger is reached', async () => {
    const sink = recordingSink();
    const log = new BufferedDecisionLog(sink, metrics, clock, options({ flushBatchSize: 2 }));

    await log.record(entry({ id: 'a' }));
    await log.record(entry({ id: 'b' }));
    await log.flush();

    expect(sink.batches).toHaveLength(1);
    expect(sink.batches[0]).toHaveLength(2);
    await log.close();
  });

  it('splits a drain into batches of at most the flush batch size', async () => {
    const sink = recordingSink();
    const log = new BufferedDecisionLog(sink, metrics, clock, options({ flushBatchSize: 2 }));

    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      await log.record(entry({ id }));
    }
    await log.flush();

    expect(sink.batches.map((batch) => batch.length)).toEqual([2, 2, 1]);
    await log.close();
  });

  it('flushes on the interval timer', async () => {
    jest.useFakeTimers();
    try {
      const sink = recordingSink();
      const log = new BufferedDecisionLog(sink, metrics, clock, options({ flushIntervalMs: 50 }));
      await log.record(entry());

      jest.advanceTimersByTime(50);
      await log.flush();

      expect(sink.batches).toHaveLength(1);
      await log.close();
    } finally {
      jest.useRealTimers();
    }
  });

  it('unrefs the flush timer so it never holds the process open', () => {
    const handle = { unref: jest.fn() } as unknown as NodeJS.Timeout;
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue(handle as unknown as ReturnType<typeof setInterval>);
    try {
      const log = new BufferedDecisionLog(recordingSink(), metrics, clock, options());

      expect(log).toBeInstanceOf(BufferedDecisionLog);
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
      expect(handle.unref).toHaveBeenCalledTimes(1);
    } finally {
      setIntervalSpy.mockRestore();
    }
  });

  it('degrades to a synchronous write at the buffer high-watermark', async () => {
    const sink = recordingSink();
    const log = new BufferedDecisionLog(
      sink,
      metrics,
      clock,
      options({ maxBufferSize: 1, flushBatchSize: 100 }),
    );

    await log.record(entry({ id: 'buffered' }));
    await log.record(entry({ id: 'degraded' }));

    expect(sink.batches).toHaveLength(1);
    expect(sink.batches[0]?.map((row) => row.id)).toEqual(['degraded']);
    expect(await metrics.render()).toMatch(
      /authz_decision_log_records_total\{[^}]*outcome="degraded"[^}]*\} 1/,
    );
    await log.close();
  });

  it('propagates the failure of a degraded synchronous write so the check fails closed', async () => {
    const sink: DecisionLogSink = { recordBatch: () => Promise.reject(new Error('store down')) };
    const log = new BufferedDecisionLog(sink, metrics, clock, options({ maxBufferSize: 0 }));

    await expect(log.record(entry())).rejects.toThrow('store down');
    await log.close();
  });

  it('counts a failed flush as dropped without rejecting the caller', async () => {
    const sink: DecisionLogSink = { recordBatch: () => Promise.reject(new Error('store down')) };
    const log = new BufferedDecisionLog(sink, metrics, clock, options());

    await log.record(entry({ id: 'a' }));
    await log.record(entry({ id: 'b' }));
    await expect(log.flush()).resolves.toBeUndefined();

    expect(await metrics.render()).toMatch(
      /authz_decision_log_records_total\{[^}]*outcome="dropped"[^}]*\} 2/,
    );
    await log.close();
  });

  it('writes each buffered entry exactly once under concurrent flushes', async () => {
    const sink = recordingSink();
    const log = new BufferedDecisionLog(sink, metrics, clock, options());
    await log.record(entry({ id: 'a' }));
    await log.record(entry({ id: 'b' }));

    await Promise.all([log.flush(), log.flush(), log.flush()]);

    expect(sink.batches.flat().map((row) => row.id)).toEqual(['a', 'b']);
    await log.close();
  });

  it('drains everything on close, including entries recorded while it flushes', async () => {
    const sink = recordingSink();
    const log = new BufferedDecisionLog(sink, metrics, clock, options());
    await log.record(entry({ id: 'a' }));

    const closing = log.close();
    await log.record(entry({ id: 'b' }));
    await closing;

    expect(sink.batches.flat().map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('stops flushing on the interval once closed', async () => {
    jest.useFakeTimers();
    try {
      const sink = recordingSink();
      const log = new BufferedDecisionLog(sink, metrics, clock, options({ flushIntervalMs: 50 }));
      await log.close();

      await log.record(entry());
      jest.advanceTimersByTime(500);
      await Promise.resolve();

      expect(sink.batches).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports buffer depth, flush lag and flushed records as metrics', async () => {
    const sink = recordingSink();
    const drifting: Clock = { now: () => new Date(now.getTime() + 2_500) };
    const log = new BufferedDecisionLog(sink, metrics, drifting, options());

    await log.record(entry({ createdAt: now }));
    expect(await metrics.render()).toMatch(/authz_decision_log_buffer_depth\{[^}]*\} 1/);

    await log.flush();

    const text = await metrics.render();
    expect(text).toMatch(/authz_decision_log_buffer_depth\{[^}]*\} 0/);
    expect(text).toMatch(/authz_decision_log_flush_lag_seconds_sum\{[^}]*\} 2\.5/);
    expect(text).toMatch(/authz_decision_log_records_total\{[^}]*outcome="flushed"[^}]*\} 1/);
    await log.close();
  });

  it('never reports a negative flush lag when the clock moves backwards', async () => {
    const sink = recordingSink();
    const behind: Clock = { now: () => new Date(now.getTime() - 5_000) };
    const log = new BufferedDecisionLog(sink, metrics, behind, options());

    await log.record(entry({ createdAt: now }));
    await log.flush();

    expect(await metrics.render()).toMatch(/authz_decision_log_flush_lag_seconds_sum\{[^}]*\} 0/);
    await log.close();
  });
});

describe('ImmediateDecisionLog', () => {
  it('writes each record straight through as a single-entry batch', async () => {
    const sink = recordingSink();
    const log = new ImmediateDecisionLog(sink);

    await log.record(entry({ id: 'a' }));
    await log.record(entry({ id: 'b' }));

    expect(sink.batches.map((batch) => batch.map((row) => row.id))).toEqual([['a'], ['b']]);
  });

  it('propagates a failing write', async () => {
    const sink: DecisionLogSink = { recordBatch: () => Promise.reject(new Error('store down')) };
    await expect(new ImmediateDecisionLog(sink).record(entry())).rejects.toThrow('store down');
  });

  it('has no-op flush and close', async () => {
    const log = new ImmediateDecisionLog(recordingSink());
    await expect(log.flush()).resolves.toBeUndefined();
    await expect(log.close()).resolves.toBeUndefined();
  });
});
