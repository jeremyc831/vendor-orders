import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const VALID_USERNAME = process.env.AUTH_USERNAME || 'admin';
const VALID_PASSWORD = process.env.AUTH_PASSWORD || 'hibernation2026';
const AUTH_COOKIE = 'spa-orders-auth';
const AUTH_TOKEN = 'authenticated';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { username, password } = body;

  if (username === VALID_USERNAME && password === VALID_PASSWORD) {
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE, AUTH_TOKEN, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
  return NextResponse.json({ success: true });
}
