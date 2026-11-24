import { NextResponse, type NextRequest } from 'next/server';

/**
 * Sends a visitor with no session cookie straight to the login page, before
 * any of the console is rendered.
 *
 * Only a first, cheap check: the cookie being present says nothing about the
 * token in it being valid. That is decided by the API on the first request,
 * and a dead token still ends on the login page, one round trip later.
 */
export function proxy(request: NextRequest): NextResponse {
  if (!request.cookies.has('porter_refresh')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the login page, the session handlers, the API rewrite
  // and Next's own static files.
  matcher: ['/((?!login|session|api|_next|favicon.ico).*)'],
};
