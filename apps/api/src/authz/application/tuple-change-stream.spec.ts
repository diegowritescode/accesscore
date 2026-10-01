import { type Clock } from '../../shared/kernel/clock';
import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';

import {
  type RelationTupleChangelog,
  type TupleChange,
  type TupleChangeQuery,
} from '../domain/ports/relation-tuple-changelog';
import {
  TupleChangeStream,
  type TupleChangeStreamOptions,
  type WatchEvent,
} from './tuple-change-stream';

const orgId = OrgId.generate();
const start = new Date('2026-08-01T00:00:00.000Z');

class SteppingClock implements Clock {
  private millis = start.getTime();

  now(): Date {
    return new Date(this.millis);
  }

  advance(ms: number): void {
    this.millis += ms;
  }
}

class StubRevisions implements RevisionsRepository {
  constructor(public high = 0) {}

  allocate(): Promise<Revision> {
    throw new Error('not used');
  }

  current(): Promise<Revision> {
    return Promise.resolve(Revision.fromValue(this.high));
  }
}

class StubChangelog implements RelationTupleChangelog {
  readonly queries: TupleChangeQuery[] = [];
  pages: TupleChange[][] = [];

  append(): Promise<void> {
    throw new Error('not used');
  }

  since(query: TupleChangeQuery): Promise<TupleChange[]> {
    this.queries.push(query);
    return Promise.resolve(this.pages.shift() ?? []);
  }
  sinceAll(): Promise<never[]> {
    return Promise.resolve([]);
  }
}

const change = (revision: number, id = `doc-${revision}`): TupleChange => ({
  orgId,
  revision: Revision.fromValue(revision),
  op: 'upsert',
  object: { type: 'document', id },
  relation: 'viewer',
  subject: { kind: 'subject', ref: { type: 'user', id: 'alice' } },
  recordedAt: start,
});

const options = (overrides: Partial<TupleChangeStreamOptions> = {}): TupleChangeStreamOptions => ({
  pollIntervalMs: 10,
  pageSize: 2,
  heartbeatSeconds: 1,
  maxStreamSeconds: 60,
  ...overrides,
});

interface Harness {
  readonly stream: TupleChangeStream;
  readonly changelog: StubChangelog;
  readonly revisions: StubRevisions;
  readonly clock: SteppingClock;
}

const harness = (
  overrides: Partial<TupleChangeStreamOptions> = {},
  perTick = 0,
  high = 0,
): Harness => {
  const changelog = new StubChangelog();
  const revisions = new StubRevisions(high);
  const clock = new SteppingClock();
  const stream = new TupleChangeStream(changelog, revisions, clock, options(overrides), () => {
    clock.advance(perTick);
    return Promise.resolve();
  });
  return { stream, changelog, revisions, clock };
};

const take = async (events: AsyncGenerator<WatchEvent>, count: number): Promise<WatchEvent[]> => {
  const collected: WatchEvent[] = [];
  for await (const event of events) {
    collected.push(event);
    if (collected.length === count) {
      break;
    }
  }
  return collected;
};

describe('TupleChangeStream', () => {
  it('emits each change from the requested cursor, scoped to the organization', async () => {
    const { stream, changelog } = harness();
    changelog.pages = [[change(4), change(5)]];

    const events = await take(stream.stream(orgId, Revision.fromValue(3)), 2);

    expect(events.map((event) => event.revision.value)).toEqual([4, 5]);
    expect(events.every((event) => event.kind === 'change')).toBe(true);
    expect(changelog.queries[0]).toEqual({
      orgId,
      afterRevision: Revision.fromValue(3),
      limit: 2,
    });
  });

  it('advances the cursor past what it emitted so a change is never re-read', async () => {
    const { stream, changelog } = harness();
    changelog.pages = [[change(4), change(5)], [change(9)]];

    await take(stream.stream(orgId, Revision.fromValue(3)), 3);

    expect(changelog.queries.map((query) => query.afterRevision.value)).toEqual([3, 5]);
  });

  it('starts at the current revision when no cursor is given, so it tails', async () => {
    const { stream, changelog } = harness({}, 0, 12);
    changelog.pages = [[change(13)]];

    await take(stream.stream(orgId, null), 1);

    expect(changelog.queries[0]?.afterRevision.value).toBe(12);
  });

  it('drains a full page immediately instead of waiting for the next poll', async () => {
    const { stream, changelog } = harness({ pageSize: 2 }, 1_000_000);
    changelog.pages = [
      [change(1), change(2)],
      [change(3), change(4)],
    ];

    const events = await take(stream.stream(orgId, Revision.fromValue(0)), 4);

    expect(events.map((event) => event.revision.value)).toEqual([1, 2, 3, 4]);
  });

  it('heartbeats when idle, carrying the cursor as its revision', async () => {
    const { stream } = harness({ heartbeatSeconds: 1 }, 1000, 7);

    const events = await take(stream.stream(orgId, Revision.fromValue(7)), 1);

    expect(events[0]).toEqual({ kind: 'heartbeat', revision: Revision.fromValue(7) });
  });

  it('advances the cursor over revisions that produced no tuple change', async () => {
    const { stream, changelog } = harness({ heartbeatSeconds: 0 }, 1000, 20);

    const events = await take(stream.stream(orgId, Revision.fromValue(5)), 2);

    expect(events[0]).toEqual({ kind: 'heartbeat', revision: Revision.fromValue(20) });
    expect(changelog.queries.map((query) => query.afterRevision.value)).toEqual([5, 20]);
  });

  it('never advances the cursor backwards when the high-water mark is behind it', async () => {
    const { stream, changelog } = harness({ heartbeatSeconds: 1 }, 1000, 2);

    const events = await take(stream.stream(orgId, Revision.fromValue(9)), 1);

    expect(events[0]?.revision.value).toBe(9);
    expect(changelog.queries[0]?.afterRevision.value).toBe(9);
  });

  it('reads the high-water mark before the page, so a change committing mid-read is not skipped', async () => {
    const revisions = new StubRevisions(0);
    const inner = new StubChangelog();
    inner.pages = [[], [change(3)]];
    const clock = new SteppingClock();
    const stream = new TupleChangeStream(
      {
        append: () => Promise.reject(new Error('not used')),
        sinceAll: () => Promise.resolve([]),
        since: (query) => {
          revisions.high = 4;
          return inner.since(query);
        },
      },
      revisions,
      clock,
      options({ heartbeatSeconds: 0 }),
      () => {
        clock.advance(1000);
        return Promise.resolve();
      },
    );

    const events = await take(stream.stream(orgId, Revision.fromValue(0)), 2);

    expect(inner.queries.map((query) => query.afterRevision.value)).toEqual([0, 0]);
    expect(events[0]).toEqual({ kind: 'heartbeat', revision: Revision.fromValue(0) });
    expect(events[1]?.revision.value).toBe(3);
  });

  it('ends every open stream on close, so a shutdown is not blocked by a live watcher', async () => {
    const { stream, changelog } = harness({ maxStreamSeconds: 3600 });
    changelog.pages = [[change(1)]];

    const collected: WatchEvent[] = [];
    for await (const event of stream.stream(orgId, Revision.fromValue(0))) {
      collected.push(event);
      stream.close();
    }

    expect(collected.map((event) => event.revision.value)).toEqual([1]);
  });

  it('ends the stream once the bounded lifetime elapses', async () => {
    const { stream } = harness({ maxStreamSeconds: 1, heartbeatSeconds: 60 }, 400);

    const collected: WatchEvent[] = [];
    for await (const event of stream.stream(orgId, Revision.fromValue(0))) {
      collected.push(event);
    }

    expect(collected).toHaveLength(0);
  });
});
