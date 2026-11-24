import { NextResponse, type NextRequest } from 'next/server';
import { serverApi, setRefreshCookie } from '@/lib/refresh-cookie';

/**
 * Logs in on the browser's behalf. The API answers with both tokens; the
 * refresh token goes into the httpOnly cookie and only the access token is
 * handed to the page.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data, error, response } = await serverApi.POST('/auth/login', {
    // A body that is not JSON is sent on as an empty object, so the API's
    // validation answers it with the same 422 any other bad body gets.
    body: (await request.json().catch(() => ({}))) as { email: string; password: string },
  });

  if (!data) {
    // 401 and 422 pass through untouched: the page renders the API's own
    // problem+json rather than an error this layer invented.
    return NextResponse.json(error, { status: response.status });
  }

  const reply = NextResponse.json({ accessToken: data.accessToken });
  setRefreshCookie(reply, data.refreshToken);
  return reply;
}
