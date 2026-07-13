import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ENV } from '../../config/env.module';
import type { Env } from '../../config/env';
import { JWKS_PROVIDER, type Jwk, type JwksProvider } from '../infrastructure/jwks/jwks-provider';

@ApiTags('jwks')
@Controller('.well-known')
export class JwksController {
  constructor(
    @Inject(JWKS_PROVIDER) private readonly jwks: JwksProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('jwks.json')
  @ApiOperation({ summary: 'Public JWKS for verifying access-token signatures' })
  async keys(@Res({ passthrough: true }) res: Response): Promise<{ keys: Jwk[] }> {
    res.setHeader('Cache-Control', `public, max-age=${this.env.JWKS_CACHE_MAX_AGE}`);
    return this.jwks.jwks();
  }
}
