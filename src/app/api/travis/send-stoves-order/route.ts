import { NextRequest, NextResponse } from 'next/server';
import { sendTravisOrder } from '@/lib/travis-submit';
import type { TravisOrderData } from '@/types/travis-order';

export async function POST(request: NextRequest) {
  try {
    const data: TravisOrderData = await request.json();
    const { orderId } = await sendTravisOrder(data, { vendor: 'travis-stoves' });
    return NextResponse.json({ success: true, orderId });
  } catch (err) {
    console.error('Send Travis stoves order error:', err);
    const message = err instanceof Error ? err.message : 'Failed to send order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
