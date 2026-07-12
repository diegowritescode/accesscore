import { HttpException } from '@nestjs/common';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
}

export class ProblemException extends HttpException {
  constructor(problem: ProblemDetails) {
    super(problem, problem.status);
  }
}
