import { NextRequest, NextResponse } from 'next/server';
import { getOrders } from '@/lib/kv';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);
    const orders = await getOrders(limit);
    return NextResponse.json(orders);
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
