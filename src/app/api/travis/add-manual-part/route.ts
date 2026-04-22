import { NextRequest, NextResponse } from 'next/server';
import { addPendingManualPart } from '@/lib/travis-manual-parts';
import { findTravisProduct } from '@/data/travis';

interface Payload {
  sku?: unknown;
  name?: unknown;
  price?: unknown;
  category?: unknown;
  brand?: unknown;
  weightLbs?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body: Payload = await request.json();

    const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const price = typeof body.price === 'number' && isFinite(body.price) ? body.price : NaN;

    if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 });
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'price must be a non-negative number' }, { status: 400 });
    }

    // If it already exists in the static catalog, reject — the user should just add it by SKU.
    if (findTravisProduct(sku)) {
      return NextResponse.json(
        { error: `SKU ${sku.toUpperCase()} is already in the catalog` },
        { status: 409 }
      );
    }

    const product = await addPendingManualPart({
      sku,
      name,
      price,
      category: typeof body.category === 'string' ? body.category : undefined,
      brand: typeof body.brand === 'string' ? body.brand : undefined,
      weightLbs: typeof body.weightLbs === 'number' ? body.weightLbs : undefined,
    });

    return NextResponse.json({ product });
  } catch (err) {
    console.error('add-manual-part failed:', err);
    return NextResponse.json({ error: 'Failed to save manual part' }, { status: 500 });
  }
}
