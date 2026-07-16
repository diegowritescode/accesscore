export interface Identity {
  email: string | null;
  subject: string;
  org: string | null;
  aal: number | null;
}

function decodeClaims(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) {
    return {};
  }
  try {
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function decodeIdentity(token: string, email: string | null): Identity {
  const claims = decodeClaims(token);
  return {
    email,
    subject: typeof claims.sub === 'string' ? claims.sub : 'unknown',
    org: typeof claims.org === 'string' ? claims.org : null,
    aal: typeof claims.aal === 'number' ? claims.aal : null,
  };
}
