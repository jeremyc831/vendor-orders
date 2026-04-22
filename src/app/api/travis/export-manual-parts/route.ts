import { NextRequest, NextResponse } from 'next/server';
import { getPendingManualParts } from '@/lib/travis-manual-parts';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function checkSyncAuth(request: NextRequest): boolean {
  const secret = process.env.GITHUB_SYNC_TOKEN;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!checkSyncAuth(request)) return unauthorized();

  try {
    const products = await getPendingManualParts();
    return NextResponse.json({ products });
  } catch (err) {
    console.error('export-manual-parts GET failed:', err);
    return NextResponse.json({ error: 'Failed to read pending parts' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!checkSyncAuth(request)) return unauthorized();

  try {
    const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
    if (hasKV) {
      const { kv } = await import('@vercel/kv');
      await kv.del('travis-parts-manual-pending');
    }
    // Local/no-KV mode: the in-memory store is per-process; nothing to do.
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('export-manual-parts DELETE failed:', err);
    return NextResponse.json({ error: 'Failed to clear pending parts' }, { status: 500 });
  }
}
