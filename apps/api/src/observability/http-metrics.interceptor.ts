import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const start = process.hrtime.bigint();
    const method = req.method;
    const route = `${context.getClass().name}.${context.getHandler().name}`;

    res.once('finish', () => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.observeHttp(method, route, res.statusCode, seconds);
    });

    return next.handle();
  }
}
