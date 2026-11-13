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
} from './problem-detail.response.js';

// `status` on a problem is a plain number -- it is parsed out of whatever the
// thrower produced -- and comparing a number against an enum member is an
// error the linter is right to raise: the two types only look alike. Widening
// the enum member once, here, keeps the magic number out of the code below.
const UNAUTHORIZED: number = HttpStatus.UNAUTHORIZED;

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

    // RFC 9110 requires a 401 to name at least one authentication scheme, and
    // RFC 6750 names this one. Without it the body says "your token is not
    // good" in prose that only a human can read, and a client is left to
    // hardcode what to send next.
    //
    // Bare `Bearer`, with no `error="invalid_token"` parameter: that parameter
    // would say which of the six checks rejected the request, and refusing to
    // say that is a decision this API has already made once, in
    // `unauthenticated()`. No `realm` either -- there is one API here, and a
    // realm name would be decoration that clients then start depending on.
    if (problem.status === UNAUTHORIZED) {
      response.setHeader('WWW-Authenticate', 'Bearer');
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
