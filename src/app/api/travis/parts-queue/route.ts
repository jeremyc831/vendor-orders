import { NextRequest, NextResponse } from 'next/server';
import {
  getQueue,
  addToQueue,
  setLineItemQty,
  removeLineItem,
  clearQueue,
  setSuffixOverride,
} from '@/lib/travis-queue';

export async function GET() {
  try {
    const queue = await getQueue();
    return NextResponse.json({ queue });
  } catch (err) {
    console.error('parts-queue GET failed:', err);
    return NextResponse.json({ error: 'Failed to read queue' }, { status: 500 });
  }
}

interface PatchPayload {
  action?: unknown;
  sku?: unknown;
  name?: unknown;
  price?: unknown;
  qty?: unknown;
  suffix?: unknown;
}

export async function PATCH(request: NextRequest) {
  try {
    const body: PatchPayload = await request.json();
    const action = typeof body.action === 'string' ? body.action : '';

    switch (action) {
      case 'add': {
        const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const price = typeof body.price === 'number' && isFinite(body.price) ? body.price : NaN;
        const qty = typeof body.qty === 'number' && isFinite(body.qty) ? body.qty : 1;
        if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 });
        if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
        if (!isFinite(price) || price < 0) {
          return NextResponse.json({ error: 'price must be a non-negative number' }, { status: 400 });
        }
        if (!isFinite(qty) || qty <= 0) {
          return NextResponse.json({ error: 'qty must be a positive number' }, { status: 400 });
        }
        await addToQueue({ sku, name, price }, qty);
        break;
      }
      case 'updateQty': {
        const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
        const qty = typeof body.qty === 'number' && isFinite(body.qty) ? body.qty : NaN;
        if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 });
        if (!isFinite(qty)) return NextResponse.json({ error: 'qty is required' }, { status: 400 });
        await setLineItemQty(sku, qty);
        break;
      }
      case 'remove': {
        const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
        if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 });
        await removeLineItem(sku);
        break;
      }
      case 'clear': {
        await clearQueue();
        break;
      }
      case 'setSuffix': {
        const suffix = typeof body.suffix === 'string' ? body.suffix : undefined;
        await setSuffixOverride(suffix);
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const queue = await getQueue();
    return NextResponse.json({ queue });
  } catch (err) {
    console.error('parts-queue PATCH failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to update queue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
