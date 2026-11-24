/**
 * The access token, kept in a variable and nowhere else.
 *
 * Not in localStorage: anything stored there is readable by every script on
 * the page and survives until somebody deletes it. A variable dies with the
 * tab, and the price is one silent `/session/refresh` after every reload.
 */
let accessToken: string | null = null;

// The refresh currently running, if any. Two requests that fail with 401 at
// the same moment must share one refresh, not start two: both would present
// the same cookie, the API rotates the token on the first, and sees the second
// as a stolen token being reused -- and revokes the whole session.
let refreshing: Promise<string | null> | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** A new access token from the cookie, or null when there is no session left. */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= fetch('/session/refresh', { method: 'POST' })
    .then(async (response) => {
      if (!response.ok) return null;
      const body = (await response.json()) as { accessToken: string };
      return body.accessToken;
    })
    .catch(() => null)
    .then((token) => {
      accessToken = token;
      refreshing = null;
      return token;
    });

  return refreshing;
}
