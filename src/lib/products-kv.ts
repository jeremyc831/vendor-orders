import { AccessoryProduct } from '@/types/accessories';

const memoryStore = new Map<string, string>();

function hasKV(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getKV() {
  const { kv } = await import('@vercel/kv');
  return kv;
}

export async function getCustomProducts(vendorId: string): Promise<AccessoryProduct[]> {
  const key = `products:${vendorId}`;
  if (hasKV()) {
    const kv = await getKV();
    const raw = await kv.get<string>(key);
    if (!raw) return [];
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(data) ? data : [];
  } else {
    const raw = memoryStore.get(key);
    return raw ? JSON.parse(raw) : [];
  }
}

export async function saveCustomProducts(vendorId: string, products: AccessoryProduct[]): Promise<void> {
  const key = `products:${vendorId}`;
  const json = JSON.stringify(products);
  if (hasKV()) {
    const kv = await getKV();
    await kv.set(key, json);
  } else {
    memoryStore.set(key, json);
  }
}

export async function getMergedProducts(
  vendorId: string,
  defaults: AccessoryProduct[]
): Promise<AccessoryProduct[]> {
  const custom = await getCustomProducts(vendorId);
  const stamped = custom.map(p => ({ ...p, isCustom: true }));
  return [...defaults, ...stamped];
}
