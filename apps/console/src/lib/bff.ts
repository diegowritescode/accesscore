import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AC_TOKEN_COOKIE, callAccessCore } from './accesscore';

export async function proxyAuthorized(
  request: Request,
  upstreamPath: string,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST',
): Promise<NextResponse> {
  const store = await cookies();
  const token = store.get(AC_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const upstream = await callAccessCore(upstreamPath, { method, token, body });
    return NextResponse.json(upstream.body ?? {}, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}

export async function proxyGet(upstreamPath: string): Promise<NextResponse> {
  const store = await cookies();
  const token = store.get(AC_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  try {
    const upstream = await callAccessCore(upstreamPath, { method: 'GET', token });
    return NextResponse.json(upstream.body ?? {}, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
