import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AC_TOKEN_COOKIE, callAccessCore, tokenCookieOptions } from '@/lib/accesscore';

export async function POST(): Promise<NextResponse> {
  const store = await cookies();
  const token = store.get(AC_TOKEN_COOKIE)?.value;

  if (token) {
    try {
      await callAccessCore('/auth/logout', { method: 'POST', token });
    } catch {
      // best effort; clearing the cookie below is what matters
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AC_TOKEN_COOKIE, '', tokenCookieOptions(0));
  return response;
}
