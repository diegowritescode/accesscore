import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  AC_TOKEN_COOKIE,
  AC_TOKEN_MAX_AGE_SECONDS,
  callAccessCore,
  tokenCookieOptions,
} from '@/lib/accesscore';

export async function POST(request: Request): Promise<NextResponse> {
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

  let upstream;
  try {
    upstream = await callAccessCore('/auth/mfa/step-up', { method: 'POST', token, body });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }

  const response = NextResponse.json(upstream.body ?? {}, { status: upstream.status });

  if (upstream.status === 200) {
    const data = upstream.body as { access_token?: unknown; expires_in?: unknown };
    if (typeof data.access_token === 'string') {
      const expiresIn =
        typeof data.expires_in === 'number' ? data.expires_in : AC_TOKEN_MAX_AGE_SECONDS;
      const maxAge = Math.max(1, Math.min(expiresIn, AC_TOKEN_MAX_AGE_SECONDS));
      response.cookies.set(AC_TOKEN_COOKIE, data.access_token, tokenCookieOptions(maxAge));
    }
  }

  return response;
}
