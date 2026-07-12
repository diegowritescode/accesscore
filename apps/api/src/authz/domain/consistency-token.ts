import { Revision } from '../../shared/kernel/revision';

const PREFIX = 'v1';

export class ConsistencyToken {
  private constructor(readonly revision: Revision) {}

  static fromRevision(revision: Revision): ConsistencyToken {
    return new ConsistencyToken(revision);
  }

  static decode(value: string): ConsistencyToken {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const separator = decoded.indexOf(':');
    const parsed = Number(decoded.slice(separator + 1));
    if (separator === -1 || decoded.slice(0, separator) !== PREFIX) {
      throw new Error('invalid consistency token');
    }
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error('invalid consistency token');
    }
    return new ConsistencyToken(Revision.fromValue(parsed));
  }

  encode(): string {
    return Buffer.from(`${PREFIX}:${this.revision.value}`).toString('base64url');
  }
}
