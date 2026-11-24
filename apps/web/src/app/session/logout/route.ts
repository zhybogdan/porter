import { NextResponse, type NextRequest } from 'next/server';
import { REFRESH_COOKIE, clearRefreshCookie, serverApi } from '@/lib/refresh-cookie';

/**
 * Revokes the session in the API and deletes the cookie. The cookie goes
 * either way: a user who pressed "Sign out" is signed out of this browser even
 * if the API could not be reached to hear about it.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    await serverApi.POST('/auth/logout', { body: { refreshToken } }).catch(() => undefined);
  }

  const reply = new NextResponse(null, { status: 204 });
  clearRefreshCookie(reply);
  return reply;
}
