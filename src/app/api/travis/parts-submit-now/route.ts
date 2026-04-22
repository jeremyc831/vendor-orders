import { NextResponse } from 'next/server';
import { getQueue, clearQueue } from '@/lib/travis-queue';
import { sendTravisOrder } from '@/lib/travis-submit';
import { buildPartsOrderData } from '@/lib/travis-parts-order';

export async function POST() {
  try {
    const queue = await getQueue();
    if (queue.lineItems.length === 0) {
      return NextResponse.json({ error: 'Queue is empty' }, { status: 400 });
    }

    const data = buildPartsOrderData(queue);
    const { orderId } = await sendTravisOrder(data, { vendor: 'travis-parts' });

    // Only clear after a successful send.
    await clearQueue();

    return NextResponse.json({ success: true, orderId });
  } catch (err) {
    console.error('parts-submit-now failed:', err);
    const message = err instanceof Error ? err.message : 'Submit failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
