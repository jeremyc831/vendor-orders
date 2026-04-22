import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'spa-orders-auth';
const AUTH_TOKEN = 'authenticated';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow auth API, login page, and cron endpoints (cron endpoints authenticate
  // via Bearer CRON_SECRET inside the handler).
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth') ||
    pathname === '/api/travis/parts-submit' ||
    pathname === '/api/travis/parts-reminder' ||
    pathname === '/api/travis/export-manual-parts'
  ) {
    return NextResponse.next();
  }

  // Check auth cookie
  const authCookie = request.cookies.get(AUTH_COOKIE);
  if (authCookie?.value !== AUTH_TOKEN) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|hibernation-logo.png|marquis-logo.png|sundance-logo.png).*)'],
};
