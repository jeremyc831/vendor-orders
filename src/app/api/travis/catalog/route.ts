import { NextResponse } from 'next/server';
import { travisCatalog } from '@/data/travis';
import { mergeCatalogWithPending } from '@/lib/travis-manual-parts';

export async function GET() {
  try {
    const merged = await mergeCatalogWithPending(travisCatalog);
    return NextResponse.json({ products: merged });
  } catch (err) {
    console.error('Travis catalog fetch failed:', err);
    return NextResponse.json({ error: 'Failed to load catalog' }, { status: 500 });
  }
}
