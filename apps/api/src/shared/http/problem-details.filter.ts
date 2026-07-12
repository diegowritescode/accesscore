import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import { type Response } from 'express';

@Catch(HttpException)
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const problem =
      typeof payload === 'object' && payload !== null && 'title' in payload
        ? (payload as Record<string, unknown>)
        : { type: 'about:blank', title: exception.message };
    response
      .status(status)
      .type('application/problem+json')
      .send({ ...problem, status });
  }
}
