import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  PROBLEM_CONTENT_TYPE,
  type ProblemDetail,
  type ProblemFieldError,
} from './problem-detail.js';

/**
 * Every error leaves through here, so the format is one decision instead of a
 * convention each handler is trusted to follow.
 *
 * Registered in `configureApp`, not in `main.ts`: the tests and the OpenAPI
 * script build the app through the same function, and a filter registered
 * only in main.ts would be absent from both.
 */
@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const problem = toProblem(exception, request.url);

    // A plain number, not HttpStatus: this asks whether the status is in
    // the 5xx range, and a range has no enum member to compare against.
    if (problem.status >= 500) {
      // The client gets nothing but "Unexpected error". The cause belongs in
      // the log, where it is not part of the API and cannot leak a query, a
      // path or a secret to whoever sent the request.
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem);
  }
}

function toProblem(exception: unknown, instance: string): ProblemDetail {
  if (!(exception instanceof HttpException)) {
    return {
      type: 'about:blank',
      title: title(HttpStatus.INTERNAL_SERVER_ERROR),
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'Unexpected error',
      instance,
    };
  }

  const status = exception.getStatus();
  const body = exception.getResponse();

  return {
    type: 'about:blank',
    title: title(status),
    status,
    ...detailOf(body, exception.message),
    instance,
  };
}

function detailOf(
  body: unknown,
  fallback: string,
): Pick<ProblemDetail, 'detail' | 'errors'> {
  if (typeof body === 'string') {
    return { detail: body };
  }

  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    const errors = Array.isArray(record['errors'])
      ? (record['errors'] as ProblemFieldError[])
      : undefined;
    const detail =
      typeof record['detail'] === 'string' ? record['detail'] : fallback;

    return errors ? { detail, errors } : { detail };
  }

  return { detail: fallback };
}

function title(status: number): string {
  return STATUS_CODES[status] ?? 'Error';
}
