import fc from 'fast-check';
import { Revision } from '../../shared/kernel/revision';
import { ConsistencyToken } from './consistency-token';

describe('ConsistencyToken', () => {
  it('round-trips any revision through encode/decode', () => {
    fc.assert(
      fc.property(fc.nat(), (value) => {
        const token = ConsistencyToken.fromRevision(Revision.fromValue(value));
        expect(ConsistencyToken.decode(token.encode()).revision.value).toBe(value);
      }),
    );
  });

  it('exposes the wrapped revision', () => {
    expect(ConsistencyToken.fromRevision(Revision.fromValue(42)).revision.value).toBe(42);
  });

  it('rejects a token with the wrong prefix', () => {
    const forged = Buffer.from('v2:5').toString('base64url');
    expect(() => ConsistencyToken.decode(forged)).toThrow('invalid consistency token');
  });

  it('rejects a token whose revision is not an integer', () => {
    const forged = Buffer.from('v1:abc').toString('base64url');
    expect(() => ConsistencyToken.decode(forged)).toThrow('invalid consistency token');
  });
});
