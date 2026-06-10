import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'spa-orders-auth';
const AUTH_TOKEN = 'authenticated';

// Paths that bypass cookie auth entirely:
//  - /login + /api/auth: the login flow itself
//  - Travis cron + GH-sync endpoints: these are hit by Vercel Cron / GitHub
//    Actions, which send no auth cookie. They authenticate INSIDE the handler
//    via `Authorization: Bearer $CRON_SECRET` / `$GITHUB_SYNC_TOKEN`.
const PUBLIC_PATHS = new Set([
  '/login',
  '/api/travis/parts-submit',
  '/api/travis/parts-reminder',
  '/api/travis/export-manual-parts',
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const authed = request.cookies.get(AUTH_COOKIE)?.value === AUTH_TOKEN;
  if (authed) {
    return NextResponse.next();
  }

  // Unauthenticated. For API/fetch requests, return a clean 401 — redirecting
  // them to the HTML /login page turns a POST into a 307 → 405 on the static
  // login route (the bug that previously led to all /api/* being opened up).
  // Browser page navigations still get redirected to the login screen.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|hibernation-logo.png|marquis-logo.png|sundance-logo.png).*)'],
};
