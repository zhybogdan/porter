import 'server-only';
import type { NextResponse } from 'next/server';
import { createPorterClient } from '@porter/contract';

/**
 * The refresh token's home in the browser: a cookie the page's own scripts
 * cannot read. Only the three `/session/*` route handlers touch it.
 *
 * httpOnly is the point. The refresh token is good for thirty days, and an
 * injected script that could read it would carry those thirty days away. It
 * still rides along with every request to this site, but a script can neither
 * see it nor send it anywhere else.
 */
export const REFRESH_COOKIE = 'porter_refresh';

// Mirrors the API's default REFRESH_TOKEN_TTL_SECONDS. The API is the judge of
// whether the token is still good; a cookie that outlives its token just gets
// a 401 from the API and is deleted then.
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function setRefreshCookie(response: NextResponse, token: string): void {
  response.cookies.set(REFRESH_COOKIE, token, {
    httpOnly: true,
    // Plain http on localhost, https everywhere else.
    secure: process.env.NODE_ENV === 'production',
    // Strict: the cookie is never sent on a request started by another site,
    // so a foreign page cannot make the browser refresh or log out for it.
    sameSite: 'strict',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearRefreshCookie(response: NextResponse): void {
  response.cookies.delete(REFRESH_COOKIE);
}

/** The API as the Next server sees it: directly, not through the rewrite. */
export const serverApi = createPorterClient({
  baseUrl: process.env.API_URL ?? 'http://localhost:3000',
});
