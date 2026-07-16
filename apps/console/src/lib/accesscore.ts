export const AC_TOKEN_COOKIE = 'ac_token';

export const ACCESSCORE_API_URL = (
  process.env.ACCESSCORE_API_URL ?? 'https://auth.deviego.xyz'
).replace(/\/+$/, '');

export const AC_TOKEN_MAX_AGE_SECONDS = 15 * 60;

export interface UpstreamResult {
  status: number;
  body: unknown;
}

interface CallOptions {
  method: string;
  token?: string;
  body?: unknown;
}

export async function callAccessCore(path: string, options: CallOptions): Promise<UpstreamResult> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${ACCESSCORE_API_URL}${path}`, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  const raw = await response.text();
  let body: unknown = null;
  if (raw.length > 0) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = { message: raw };
    }
  }

  return { status: response.status, body };
}

export function tokenCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}
