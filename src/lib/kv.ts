import { StoredOrder, OrderStatus } from '@/types/order-history';

// In-memory fallback for local dev without KV credentials
const memoryStore = new Map<string, string>();
const memorySortedSet: { id: string; score: number }[] = [];

function hasKV(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getKV() {
  const { kv } = await import('@vercel/kv');
  return kv;
}

export async function saveOrder(order: StoredOrder): Promise<void> {
  if (hasKV()) {
    const kv = await getKV();
    await kv.set(`order:${order.id}`, JSON.stringify(order));
    await kv.zadd('orders:all', { score: new Date(order.createdAt).getTime(), member: order.id });
  } else {
    memoryStore.set(`order:${order.id}`, JSON.stringify(order));
    memorySortedSet.push({ id: order.id, score: new Date(order.createdAt).getTime() });
    memorySortedSet.sort((a, b) => b.score - a.score);
  }
}

export async function getOrders(limit = 50): Promise<StoredOrder[]> {
  if (hasKV()) {
    const kv = await getKV();
    const ids = await kv.zrange('orders:all', 0, limit - 1, { rev: true }) as string[];
    if (!ids.length) return [];
    const keys = ids.map(id => `order:${id}`);
    const results = await kv.mget<string[]>(...keys);
    return results
      .filter(Boolean)
      .map(r => typeof r === 'string' ? JSON.parse(r) : r as unknown as StoredOrder);
  } else {
    const ids = memorySortedSet.slice(0, limit).map(e => e.id);
    return ids
      .map(id => memoryStore.get(`order:${id}`))
      .filter(Boolean)
      .map(r => JSON.parse(r!));
  }
}

export async function getOrder(id: string): Promise<StoredOrder | null> {
  if (hasKV()) {
    const kv = await getKV();
    const raw = await kv.get<string>(`order:${id}`);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw as unknown as StoredOrder;
  } else {
    const raw = memoryStore.get(`order:${id}`);
    return raw ? JSON.parse(raw) : null;
  }
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  statusNotes?: string
): Promise<StoredOrder | null> {
  const order = await getOrder(id);
  if (!order) return null;

  order.status = status;
  order.updatedAt = new Date().toISOString();
  if (statusNotes !== undefined) order.statusNotes = statusNotes;

  if (hasKV()) {
    const kv = await getKV();
    await kv.set(`order:${id}`, JSON.stringify(order));
  } else {
    memoryStore.set(`order:${id}`, JSON.stringify(order));
  }

  return order;
}
