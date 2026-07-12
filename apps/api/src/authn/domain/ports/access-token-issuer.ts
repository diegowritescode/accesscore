export interface AccessTokenClaims {
  sub: string;
  sid: string;
  org: string | null;
  aal: number;
  authTime: Date;
}

export interface IssuedAccessToken {
  token: string;
  jti: string;
  expiresAt: Date;
  expiresInSeconds: number;
}

export interface AccessTokenIssuer {
  issue(claims: AccessTokenClaims): Promise<IssuedAccessToken>;
}

export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');
