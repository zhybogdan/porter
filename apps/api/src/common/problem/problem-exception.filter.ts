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
import { Prisma } from '../../generated/prisma/client.js';
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

/**
 * Constraint violations the database reports, and what a client is told.
 *
 * The codes are Prisma's, checked against what this Prisma version really
 * throws rather than remembered: a duplicate unit label arrives as `P2002`
 * (Postgres `23505`), a unit pointing at a property of another organization
 * as `P2003` (Postgres `23503`). Both are 409: the request was well formed,
 * and what it ran into is the current state of the data, not its own shape.
 *
 * Mapped here and not in each service, so the rule is one decision. A
 * service that wants a better sentence than the generic one checks first and
 * throws its own exception; this is the net under every service that did not.
 * The constraint name stays in the log: it is the database's vocabulary, and
 * putting it in the API would make renaming an index a breaking change.
 */
const CONSTRAINT_PROBLEMS = new Map<string, string>([
  ['P2002', 'Conflicts with an existing record'],
  ['P2003', 'Refers to a record that does not exist'],
]);

function toProblem(exception: unknown, instance: string): ProblemDetail {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const detail = CONSTRAINT_PROBLEMS.get(exception.code);

    if (detail !== undefined) {
      return {
        type: 'about:blank',
        title: title(HttpStatus.CONFLICT),
        status: HttpStatus.CONFLICT,
        detail,
        instance,
      };
    }
  }

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
