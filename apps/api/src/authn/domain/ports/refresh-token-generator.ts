export interface GeneratedRefreshToken {
  raw: string;
  hash: string;
}

export interface RefreshTokenGenerator {
  generate(): GeneratedRefreshToken;
  hash(raw: string): string;
}

export const REFRESH_TOKEN_GENERATOR = Symbol('REFRESH_TOKEN_GENERATOR');
