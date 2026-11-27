import type { components } from '@porter/contract';

type ProblemDetail = components['schemas']['ProblemDetail'];
export type FieldProblem = components['schemas']['ProblemFieldError'];

/**
 * An answer from the API that was not a success, carried as an exception so
 * TanStack Query puts it in `error`.
 *
 * The status stays on it, because the screen decides by status what to say:
 * a 412 is "somebody changed this", a 422 goes next to the fields, and
 * only the rest falls back to the server's own `detail`. The API answers
 * every error in problem+json, so all of this is read from one known shape
 * instead of guessed from a string.
 */
export class ApiProblem extends Error {
  readonly status: number;
  readonly fieldErrors: FieldProblem[];

  constructor(status: number, message: string, fieldErrors: FieldProblem[] = []) {
    super(message);
    this.name = 'ApiProblem';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const FALLBACK = 'Something went wrong on the server. Try again.';

/** Turns the `error` half of an openapi-fetch result into an `ApiProblem`. */
export function toProblem(response: Response, body: unknown): ApiProblem {
  const problem = body as Partial<ProblemDetail> | undefined;
  return new ApiProblem(
    response.status,
    problem?.detail ?? problem?.title ?? FALLBACK,
    problem?.errors ?? [],
  );
}

/**
 * Runs one API call and turns a dead network into the same kind of error as
 * a refusal, so a screen has one error path to render, not two.
 */
export async function callApi<T>(
  call: () => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<{ data: T; response: Response }> {
  let result: Awaited<ReturnType<typeof call>>;
  try {
    result = await call();
  } catch {
    throw new ApiProblem(0, 'The server could not be reached. Check the connection and try again.');
  }
  if (result.data === undefined) throw toProblem(result.response, result.error);
  return { data: result.data, response: result.response };
}
