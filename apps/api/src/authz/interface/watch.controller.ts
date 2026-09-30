import {
  Controller,
  Headers,
  Inject,
  type MessageEvent,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { from, map, type Observable } from 'rxjs';
import { AccessTokenGuard, type AuthTokenClaims } from '../../authn/interface/access-token.guard';
import { AuthToken } from '../../authn/interface/auth-token.decorator';
import { ProblemException } from '../../shared/http/problem-details';
import { OrgId } from '../../shared/kernel/org-id';
import { type Revision } from '../../shared/kernel/revision';
import {
  TUPLE_CHANGE_STREAM,
  type TupleChangeStream,
  type WatchEvent,
} from '../application/tuple-change-stream';
import { ConsistencyToken } from '../domain/consistency-token';
import { watchQuerySchema } from './check.dto';
import { PapAdminGuard } from './pap-admin.guard';

const badRequest = (title: string): ProblemException =>
  new ProblemException({ type: 'about:blank', title, status: 400 });

@ApiTags('authz')
@ApiBearerAuth('access-token')
@Controller('authz')
@UseGuards(AccessTokenGuard, PapAdminGuard)
export class WatchController {
  constructor(@Inject(TUPLE_CHANGE_STREAM) private readonly changes: TupleChangeStream) {}

  @Sse('watch')
  @ApiOperation({
    summary: 'Stream relationship-tuple changes (Server-Sent Events)',
    description:
      'Owner-gated. Emits a named `change` event per relationship-tuple mutation and a periodic ' +
      '`heartbeat` that also advances the cursor past revisions with no tuple change. Every event ' +
      'id is a consistency token: pass it back as `Last-Event-ID` (browsers do this automatically ' +
      'on reconnect) or as `?since=` to resume, or use it directly as a `check` consistency token. ' +
      'Delivery is at-least-once — dedup on (id, tuple key). Streams close after a bounded ' +
      'lifetime and are meant to be resumed.',
  })
  @ApiResponse({ status: 200, description: 'The event stream (`text/event-stream`).' })
  @ApiResponse({ status: 400, description: 'No organization in the token, or an invalid cursor.' })
  watch(
    @AuthToken() token: AuthTokenClaims,
    @Query() query: unknown,
    @Headers('last-event-id') lastEventId?: string,
  ): Observable<MessageEvent> {
    if (!token.org) {
      throw badRequest('No organization context');
    }
    const parsed = watchQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('Invalid watch query');
    }
    const cursor = this.cursorOf(lastEventId ?? parsed.data.since);
    return from(this.changes.stream(OrgId.fromString(token.org), cursor)).pipe(
      map((event) => toMessageEvent(event)),
    );
  }

  private cursorOf(token: string | undefined): Revision | null {
    if (token === undefined || token === '') {
      return null;
    }
    try {
      return ConsistencyToken.decode(token).revision;
    } catch {
      throw badRequest('Invalid watch cursor');
    }
  }
}

function toMessageEvent(event: WatchEvent): MessageEvent {
  const id = ConsistencyToken.fromRevision(event.revision).encode();
  if (event.kind === 'heartbeat') {
    return { id, type: 'heartbeat', data: { consistency_token: id } };
  }
  const { change } = event;
  return {
    id,
    type: 'change',
    data: {
      op: change.op,
      object: { type: change.object.type, id: change.object.id },
      relation: change.relation,
      subject:
        change.subject.kind === 'userset'
          ? {
              type: change.subject.ref.type,
              id: change.subject.ref.id,
              relation: change.subject.relation,
            }
          : { type: change.subject.ref.type, id: change.subject.ref.id },
      consistency_token: id,
      recorded_at: change.recordedAt.toISOString(),
    },
  };
}
