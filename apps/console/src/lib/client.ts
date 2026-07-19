import type {
  CheckAsInput,
  CheckInput,
  Decision,
  ExpandInput,
  ExpandResponse,
  NamespaceSummary,
  SimulateInput,
  SimulateResponse,
  TupleView,
} from './types';

export type ApiResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unauthorized' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    for (const key of ['message', 'title', 'error', 'detail']) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  }
  return fallback;
}

async function post<T>(path: string, payload: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { status: 'unavailable' };
  }

  if (response.status === 401) {
    return { status: 'unauthorized' };
  }
  if (response.status === 503) {
    return { status: 'unavailable' };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    return { status: 'error', message: messageFrom(body, `Request failed (${response.status})`) };
  }

  return { status: 'ok', data: body as T };
}

async function get<T>(path: string): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch {
    return { status: 'unavailable' };
  }

  if (response.status === 401) {
    return { status: 'unauthorized' };
  }
  if (response.status === 503) {
    return { status: 'unavailable' };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    return { status: 'error', message: messageFrom(body, `Request failed (${response.status})`) };
  }

  return { status: 'ok', data: body as T };
}

export async function login(email: string, password: string): Promise<ApiResult<{ ok: true }>> {
  return post('/api/login', { email, password });
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch {
    // best effort; the cookie is cleared server-side
  }
}

export async function runCheck(input: CheckInput): Promise<ApiResult<Decision>> {
  return post('/api/check', {
    subject: input.subject,
    action: input.action,
    resource: input.resource,
  });
}

export async function runCheckAs(input: CheckAsInput): Promise<ApiResult<Decision>> {
  const payload: Record<string, unknown> = {
    subject: input.subject,
    action: input.action,
    resource: input.resource,
  };
  if (typeof input.aal === 'number') {
    payload.aal = input.aal;
  }
  return post('/api/check-as', payload);
}

export async function runExpand(input: ExpandInput): Promise<ApiResult<ExpandResponse>> {
  return post('/api/expand', { resource: input.resource, relation: input.relation });
}

export async function fetchNamespaces(): Promise<ApiResult<{ namespaces: NamespaceSummary[] }>> {
  return get('/api/namespaces');
}

export async function fetchTuples(query = ''): Promise<ApiResult<{ tuples: TupleView[] }>> {
  return get(`/api/tuples${query ? `?${query}` : ''}`);
}

export async function runSimulate(input: SimulateInput): Promise<ApiResult<SimulateResponse>> {
  const payload: Record<string, unknown> = { action: input.action, resource: input.resource };
  if (input.policies && input.policies.length > 0) {
    payload.policies = input.policies;
  }
  return post('/api/simulate', payload);
}
