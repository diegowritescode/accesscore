import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ProblemException } from '../../shared/http/problem-details';
import { REVOCATION_STORE, type RevocationStore } from '../domain/ports/revocation-store';
import { JWT_VERIFIER, type JwtVerifier } from '../infrastructure/tokens/jwt-verifier';

export interface AuthTokenClaims {
  sub: string;
  sid: string;
  org: string | null;
  jti: string;
  aal: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  authToken: AuthTokenClaims;
}

const unauthorized = (): ProblemException =>
  new ProblemException({ type: 'about:blank', title: 'Unauthorized', status: 401 });

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier,
    @Inject(REVOCATION_STORE) private readonly revocation: RevocationStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized();
    }

    const result = await this.verifier.verify(header.slice('Bearer '.length).trim());
    if (!result.ok) {
      throw unauthorized();
    }

    const { sub, sid, jti, exp, aal, org } = result.value;
    if (
      typeof sub !== 'string' ||
      typeof sid !== 'string' ||
      typeof jti !== 'string' ||
      typeof exp !== 'number'
    ) {
      throw unauthorized();
    }

    if (await this.revocation.isRevoked(`sid:${sid}`)) {
      throw unauthorized();
    }

    request.authToken = {
      sub,
      sid,
      org: typeof org === 'string' ? org : null,
      jti,
      exp,
      aal: typeof aal === 'number' ? aal : 0,
    };
    return true;
  }
}
