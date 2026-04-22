/**
 * KV-backed manual-parts helpers.
 *
 * Unknown SKUs typed into the Travis forms land in `travis-parts-manual-pending`.
 * A weekly GitHub Actions workflow (Plan 3) syncs those into
 * `src/data/travis/parts-manual.ts` and clears the KV list.
 *
 * Mirrors the `hasKV()` + in-memory fallback pattern from `src/lib/kv.ts` so
 * local dev without KV creds still works.
 */
import type { TravisProduct } from '@/types/travis';

const KEY = 'travis-parts-manual-pending';

// In-memory fallback for local dev without KV credentials.
let memFallback: TravisProduct[] = [];

function hasKV(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getKV() {
  const { kv } = await import('@vercel/kv');
  return kv;
}

export async function getPendingManualParts(): Promise<TravisProduct[]> {
  if (hasKV()) {
    const kv = await getKV();
    const stored = await kv.get<TravisProduct[]>(KEY);
    return stored ?? [];
  }
  return memFallback;
}

export interface AddPendingInput {
  sku: string;
  name: string;
  price: number;
  category?: string;
  brand?: string;
  weightLbs?: number;
}

/**
 * Add a pending manual part. Dedupes by uppercase SKU — later writes win.
 * Returns the stored entry (source='manual', lastUpdated=today).
 */
export async function addPendingManualPart(input: AddPendingInput): Promise<TravisProduct> {
  const today = new Date().toISOString().slice(0, 10);
  const normalizedSku = input.sku.trim().toUpperCase();
  const entry: TravisProduct = {
    sku: normalizedSku,
    name: input.name.trim(),
    price: input.price,
    category: input.category,
    brand: input.brand,
    weightLbs: input.weightLbs,
    source: 'manual',
    lastUpdated: today,
  };

  const existing = await getPendingManualParts();
  const filtered = existing.filter(p => p.sku.toUpperCase() !== normalizedSku);
  const updated = [...filtered, entry];

  if (hasKV()) {
    const kv = await getKV();
    await kv.set(KEY, updated);
  } else {
    memFallback = updated;
  }

  return entry;
}

/**
 * Merge the catalog with the KV pending list. Pending entries win on SKU
 * collision (they're the newest truth).
 */
export async function mergeCatalogWithPending(
  catalog: TravisProduct[]
): Promise<TravisProduct[]> {
  const pending = await getPendingManualParts();
  if (pending.length === 0) return catalog;

  const bySku = new Map<string, TravisProduct>();
  for (const p of catalog) bySku.set(p.sku.toUpperCase(), p);
  for (const p of pending) bySku.set(p.sku.toUpperCase(), p);
  return Array.from(bySku.values());
}
