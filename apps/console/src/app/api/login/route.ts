import { NextResponse } from 'next/server';
import {
  AC_TOKEN_COOKIE,
  AC_TOKEN_MAX_AGE_SECONDS,
  callAccessCore,
  tokenCookieOptions,
} from '@/lib/accesscore';

export async function POST(request: Request): Promise<NextResponse> {
  let payload: { email?: unknown; password?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const email = typeof payload.email === 'string' ? payload.email : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  let upstream;
  try {
    upstream = await callAccessCore('/auth/login', { method: 'POST', body: { email, password } });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }

  if (upstream.status !== 200) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const data = upstream.body as { access_token?: unknown; expires_in?: unknown };
  if (typeof data.access_token !== 'string') {
    return NextResponse.json(
      { error: 'Unexpected response from authorization service.' },
      {
        status: 502,
      },
    );
  }

  const expiresIn =
    typeof data.expires_in === 'number' ? data.expires_in : AC_TOKEN_MAX_AGE_SECONDS;
  const maxAge = Math.max(1, Math.min(expiresIn, AC_TOKEN_MAX_AGE_SECONDS));

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AC_TOKEN_COOKIE, data.access_token, tokenCookieOptions(maxAge));
  return response;
}
