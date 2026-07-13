import { type INestApplication } from '@nestjs/common';
import { type OpenAPIObject } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { type NextFunction, type Request, type Response } from 'express';

const REFERENCE_PATH = '/reference';

const referenceCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "img-src 'self' data: https://cdn.jsdelivr.net",
  "connect-src 'self'",
].join('; ');

export function mountApiReference(app: INestApplication, document: OpenAPIObject): void {
  app.use(
    REFERENCE_PATH,
    (_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Content-Security-Policy', referenceCsp);
      next();
    },
    apiReference({ content: document, theme: 'purple' }),
  );
}
