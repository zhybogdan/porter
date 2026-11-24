import { createPorterClient } from '@porter/contract';
import { getAccessToken, refreshAccessToken } from './session';

function withToken(request: Request, token: string | null): Request {
  if (token) request.headers.set('Authorization', `Bearer ${token}`);
  return request;
}

function goToLogin(): void {
  // A full navigation rather than a router push: whatever the dead session
  // left in memory -- cached queries, the token -- goes with the page.
  window.location.assign('/login');
}

/**
 * The fetch every API call in the browser goes through.
 *
 * No token yet (a fresh page load): get one from the cookie before asking.
 * A 401 (the token expired while the tab was open): refresh once and repeat
 * the request. If there is no session left, the user lands on the login page
 * instead of looking at a screen that silently failed.
 */
async function authorizedFetch(request: Request): Promise<Response> {
  // The body of a request can be read only once, so a copy is kept for the
  // retry before the first attempt consumes it.
  const retry = request.clone();

  const token = getAccessToken() ?? (await refreshAccessToken());
  if (!token) {
    goToLogin();
    return new Response(null, { status: 401 });
  }

  const response = await fetch(withToken(request, token));
  if (response.status !== 401) return response;

  const renewed = await refreshAccessToken();
  if (!renewed) {
    goToLogin();
    return response;
  }
  return fetch(withToken(retry, renewed));
}

/** The generated client, pointed at this site's `/api/*` rewrite. */
export const api = createPorterClient({ baseUrl: '/api', fetch: authorizedFetch });
