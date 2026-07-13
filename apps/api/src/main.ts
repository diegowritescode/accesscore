import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ENV } from './config/env.module';
import type { Env } from './config/env';
import { buildOpenApiDocument } from './openapi-document';
import { mountApiReference } from './openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);
  app.use(helmet());
  app.useBodyParser('json', { limit: '32kb' });
  app.enableShutdownHooks();
  mountApiReference(app, buildOpenApiDocument(app));
  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
  Logger.log(`AccessCore API listening on :${env.PORT}`, 'Bootstrap');
}

void bootstrap();
