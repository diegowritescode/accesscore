import { randomUUID } from 'node:crypto';
import { err, ok, type Result } from '../../shared/result';
import { type AccessTokenIssuer } from '../domain/ports/access-token-issuer';
import { type Clock } from '../../shared/kernel/clock';
import { type RefreshGraceCache } from '../domain/ports/refresh-grace-cache';
import { type RefreshTokenGenerator } from '../domain/ports/refresh-token-generator';
import { type RefreshTokensRepository } from '../domain/ports/refresh-tokens-repository';
import { type SessionsRepository } from '../domain/ports/sessions-repository';
import { type TokenFamiliesRepository } from '../domain/ports/token-families-repository';
import { type RefreshToken } from '../domain/refresh-token';
import { type Session } from '../domain/session';
import { type TokenFamily } from '../domain/token-family';

export interface RefreshCommand {
  refreshToken: string;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface RefreshConfig {
  graceSeconds: number;
}

export type RefreshError = 'invalid' | 'reuse';

export const REFRESH_HANDLER = Symbol('REFRESH_HANDLER');

const RACE_RETRIES = 6;
const RACE_DELAY_MS = 25;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class RefreshHandler {
  constructor(
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly tokenFamilies: TokenFamiliesRepository,
    private readonly sessions: SessionsRepository,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly generator: RefreshTokenGenerator,
    private readonly graceCache: RefreshGraceCache,
    private readonly clock: Clock,
    private readonly config: RefreshConfig,
  ) {}

  async execute(command: RefreshCommand): Promise<Result<RefreshResult, RefreshError>> {
    const now = this.clock.now();
    const hash = this.generator.hash(command.refreshToken);
    const token = await this.refreshTokens.findByHash(hash);
    if (!token || token.expiresAt <= now) {
      return err('invalid');
    }

    const family = await this.tokenFamilies.findById(token.familyId);
    if (!family || family.status !== 'active') {
      return err('invalid');
    }

    const session = await this.sessions.findById(family.sessionId);
    if (!session || session.status !== 'active' || session.expiresAt <= now) {
      return err('invalid');
    }

    if (token.status === 'active') {
      const rotated = await this.tryRotate(token, family, session, hash, now);
      if (rotated) {
        return ok(rotated);
      }
    } else {
      const replayed = await this.replayFromGrace(token, hash, 1);
      if (replayed) {
        return ok(replayed);
      }
    }

    await this.tokenFamilies.revokeForReuse(family.id, now, {
      userId: family.userId.value,
      sessionId: family.sessionId.value,
      generation: token.generation,
    });
    return err('reuse');
  }

  private async tryRotate(
    token: RefreshToken,
    family: TokenFamily,
    session: Session,
    hash: string,
    now: Date,
  ): Promise<RefreshResult | null> {
    const generated = this.generator.generate();
    const successor: RefreshToken = {
      id: randomUUID(),
      familyId: token.familyId,
      tokenHash: generated.hash,
      generation: token.generation + 1,
      status: 'active',
      createdAt: now,
      expiresAt: session.expiresAt,
      consumedAt: null,
    };
    const access = await this.accessTokens.issue({
      sub: family.userId.value,
      sid: session.id.value,
      aal: 1,
      authTime: session.createdAt,
    });

    const won = await this.refreshTokens.rotate(token.id, successor, now);
    if (!won) {
      return this.replayFromGrace(token, hash, RACE_RETRIES);
    }

    await this.sessions.touch(session.id, now);
    await this.graceCache.put(
      hash,
      {
        accessToken: access.token,
        refreshToken: generated.raw,
        expiresIn: access.expiresInSeconds,
        successorGeneration: successor.generation,
      },
      this.config.graceSeconds,
    );
    return {
      accessToken: access.token,
      refreshToken: generated.raw,
      tokenType: 'Bearer',
      expiresIn: access.expiresInSeconds,
    };
  }

  private async replayFromGrace(
    token: RefreshToken,
    hash: string,
    attempts: number,
  ): Promise<RefreshResult | null> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const cached = await this.graceCache.get(hash);
      if (cached) {
        const active = await this.refreshTokens.findActiveByFamily(token.familyId);
        if (active && active.generation === cached.successorGeneration) {
          return {
            accessToken: cached.accessToken,
            refreshToken: cached.refreshToken,
            tokenType: 'Bearer',
            expiresIn: cached.expiresIn,
          };
        }
        return null;
      }
      if (attempt < attempts - 1) {
        await sleep(RACE_DELAY_MS);
      }
    }
    return null;
  }
}
