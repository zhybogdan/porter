import { NextResponse, type NextRequest } from 'next/server';
import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  serverApi,
  setRefreshCookie,
} from '@/lib/refresh-cookie';

/**
 * Trades the cookie for a fresh access token. Called after a reload, when the
 * page has lost the access token it kept in memory, and after a 401.
 *
 * The API rotates the refresh token on every call, so the cookie is rewritten
 * every time too. Keeping the old one would make the next refresh present a
 * token the API has already seen, which it treats as theft.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json(
      {
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'No session',
        instance: '/session/refresh',
      },
      { status: 401, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  const { data, error, response } = await serverApi.POST('/auth/refresh', {
    body: { refreshToken },
  });

  if (!data) {
    // A token the API refuses will never work again; deleting the cookie
    // keeps the next page load from trying it once more.
    const reply = NextResponse.json(error, { status: response.status });
    clearRefreshCookie(reply);
    return reply;
  }

  const reply = NextResponse.json({ accessToken: data.accessToken });
  setRefreshCookie(reply, data.refreshToken);
  return reply;
}
