/**
 * What login and refresh both return. Two tokens with different jobs: the
 * access token is shown to the API on every request and therefore kept
 * short-lived, the refresh token is shown once per renewal and therefore
 * revocable -- it has a row in `sessions`, which the access token has not.
 */
export interface TokenPair {
  accessToken: string;
  /** Lifetime of the access token in seconds, so the client need not decode it. */
  expiresIn: number;
  refreshToken: string;
}
