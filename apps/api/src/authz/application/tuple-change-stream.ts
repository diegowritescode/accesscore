import { type Clock } from '../../shared/kernel/clock';
import { type OrgId } from '../../shared/kernel/org-id';
import { type Revision } from '../../shared/kernel/revision';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';
import {
  type RelationTupleChangelog,
  type TupleChange,
} from '../domain/ports/relation-tuple-changelog';

export type WatchEvent =
  | { readonly kind: 'change'; readonly revision: Revision; readonly change: TupleChange }
  | { readonly kind: 'heartbeat'; readonly revision: Revision };

export interface TupleChangeStreamOptions {
  readonly pollIntervalMs: number;
  readonly pageSize: number;
  readonly heartbeatSeconds: number;
  readonly maxStreamSeconds: number;
}

export type Sleeper = (ms: number) => Promise<void>;

export const realSleeper: Sleeper = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });

export const TUPLE_CHANGE_STREAM = Symbol('TUPLE_CHANGE_STREAM');

export class TupleChangeStream {
  private closing = false;

  constructor(
    private readonly changelog: RelationTupleChangelog,
    private readonly revisions: RevisionsRepository,
    private readonly clock: Clock,
    private readonly options: TupleChangeStreamOptions,
    private readonly sleep: Sleeper = realSleeper,
  ) {}

  close(): void {
    this.closing = true;
  }

  async *stream(orgId: OrgId, from: Revision | null): AsyncGenerator<WatchEvent> {
    const startedAt = this.clock.now().getTime();
    const deadline = startedAt + this.options.maxStreamSeconds * 1000;
    let cursor = from ?? (await this.revisions.current());
    let beatAt = startedAt;

    while (!this.closing && this.clock.now().getTime() < deadline) {
      const high = await this.revisions.current();
      const page = await this.changelog.since({
        orgId,
        afterRevision: cursor,
        limit: this.options.pageSize,
      });
      for (const change of page) {
        cursor = change.revision;
        yield { kind: 'change', revision: change.revision, change };
      }
      if (page.length === this.options.pageSize) {
        continue;
      }
      const now = this.clock.now().getTime();
      if (now - beatAt >= this.options.heartbeatSeconds * 1000) {
        beatAt = now;
        if (high.isAtLeast(cursor)) {
          cursor = high;
        }
        yield { kind: 'heartbeat', revision: cursor };
      }
      await this.sleep(this.options.pollIntervalMs);
    }
  }
}
