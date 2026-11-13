/**
 * What login and refresh both return. Two tokens with different jobs: the
 * access token is shown to the API on every request and therefore kept
 * short-lived, the refresh token is shown once per renewal and therefore
 * revocable -- it has a row in `sessions`, which the access token has not.
 *
 * A class rather than the interface this used to be, and the reason is the
 * contract. Interfaces are erased at compile time, so the OpenAPI plugin has
 * nothing left to read and the response comes out of the generator as an
 * untyped object. A class survives into the build, and the plugin writes its
 * fields and their types into the document.
 */
export class TokenPair {
  /** Signed JWT, sent as `Authorization: Bearer <token>` on every request. */
  accessToken!: string;

  /** Lifetime of the access token in seconds, so the client need not decode it. */
  expiresIn!: number;

  /** Opaque string, exchanged at `POST /auth/refresh` for the next pair. */
  refreshToken!: string;
}
