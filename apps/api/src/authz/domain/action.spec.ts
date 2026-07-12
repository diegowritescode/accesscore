import { Action } from './action';

describe('Action', () => {
  it('parses a namespaced action into namespace and verb', () => {
    const result = Action.create('document.read');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.namespace).toBe('document');
    expect(result.value.verb).toBe('read');
    expect(result.value.name).toBe('document.read');
  });

  it.each(['document', 'document.', '.read', 'a.b.c', '', 'doc ument.read', 'document.re ad'])(
    'rejects the malformed action "%s"',
    (name) => {
      expect(Action.create(name).ok).toBe(false);
    },
  );

  it('of() throws on an invalid action', () => {
    expect(() => Action.of('nope')).toThrow();
  });

  it('compares by namespace and verb', () => {
    expect(Action.of('document.read').equals(Action.of('document.read'))).toBe(true);
    expect(Action.of('document.read').equals(Action.of('document.write'))).toBe(false);
  });
});
