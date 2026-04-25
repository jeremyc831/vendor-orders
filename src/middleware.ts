import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'spa-orders-auth';
const AUTH_TOKEN = 'authenticated';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and all API routes
  if (pathname === '/login' || pathname.startsWith('/api/')) {
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
