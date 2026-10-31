/**
 * The error format of this API: RFC 9457, "Problem Details for HTTP APIs".
 *
 * It is part of the contract, not an implementation detail. Clients branch on
 * `status` and show `detail`; the web console renders `errors` next to the
 * fields that failed.
 */
export interface ProblemFieldError {
  /** Dotted path of the field that failed, e.g. `unit.label`. */
  field: string;
  message: string;
}

export interface ProblemDetail {
  /**
   * A URI identifying the problem kind. `about:blank` means "nothing beyond
   * the status code", which is the honest answer for plain HTTP errors. A
   * problem that clients must handle specially gets its own URI, and that URI
   * then becomes part of the contract.
   */
  type: string;
  title: string;
  status: number;
  detail?: string;
  /** The path that produced the problem. */
  instance: string;
  errors?: ProblemFieldError[];
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';
