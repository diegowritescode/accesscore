import { createClient } from './client';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const resource = { type: 'document', id: 'doc-1' };
const permit = { effect: 'permit', reasons: [] };

describe('createClient().check', () => {
  it('returns the decision and forwards the token, action, resource, and zookie', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Promise.resolve(jsonResponse(permit));
    };
    const client = createClient({ baseUrl: 'https://authz.example.com/', fetch: fetchImpl });

    const decision = await client.check('document.read', resource, {
      token: 'tok',
      consistencyToken: 'zk',
    });

    expect(decision.effect).toBe('permit');
    expect(capturedUrl).toBe('https://authz.example.com/authz/check');
    expect((capturedInit?.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(String(capturedInit?.body))).toEqual({
      action: 'document.read',
      resource,
      consistency_token: 'zk',
    });
  });

  it('denies as unauthenticated on a 401', async () => {
    const client = createClient({
      baseUrl: 'https://x',
      fetch: () => Promise.resolve(jsonResponse({}, 401)),
    });

    const decision = await client.check('document.read', resource, { token: 't' });

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('unauthenticated');
  });

  it('fails closed (pdp_unavailable) on a 5xx', async () => {
    const client = createClient({
      baseUrl: 'https://x',
      fetch: () => Promise.resolve(jsonResponse({}, 503)),
    });

    const decision = await client.check('document.read', resource, { token: 't' });

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('pdp_unavailable');
  });

  it('fails closed on a transport error', async () => {
    const client = createClient({
      baseUrl: 'https://x',
      fetch: () => Promise.reject(new Error('offline')),
    });

    const decision = await client.check('document.read', resource, { token: 't' });

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('pdp_unavailable');
  });

  it('fails closed on an unparseable body', async () => {
    const client = createClient({
      baseUrl: 'https://x',
      fetch: () => Promise.resolve(new Response('not json', { status: 200 })),
    });

    const decision = await client.check('document.read', resource, { token: 't' });

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('pdp_unavailable');
  });
});
