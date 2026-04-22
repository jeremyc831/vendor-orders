/**
 * KV-backed Travis Parts queue.
 *
 * One growing order lives in KV under `travis-parts-queue`; Thursday 1pm PT the
 * cron auto-submits and clears. Mirrors the `hasKV()` + in-memory fallback
 * pattern from `src/lib/kv.ts` and `src/lib/travis-manual-parts.ts` so local dev
 * without KV creds still works end-to-end.
 */
import type {
  TravisPartsQueue,
  TravisQueueLineItem,
} from '@/types/travis';

const KEY = 'travis-parts-queue';

// In-memory fallback for local dev without KV credentials.
let memFallback: TravisPartsQueue = emptyQueue();

function emptyQueue(): TravisPartsQueue {
  return { lineItems: [], lastUpdated: new Date().toISOString() };
}

function hasKV(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getKV() {
  const { kv } = await import('@vercel/kv');
  return kv;
}

async function readQueue(): Promise<TravisPartsQueue> {
  if (hasKV()) {
    const kv = await getKV();
    const stored = await kv.get<TravisPartsQueue>(KEY);
    return stored ?? emptyQueue();
  }
  return memFallback;
}

async function writeQueue(queue: TravisPartsQueue): Promise<void> {
  const withStamp: TravisPartsQueue = { ...queue, lastUpdated: new Date().toISOString() };
  if (hasKV()) {
    const kv = await getKV();
    await kv.set(KEY, withStamp);
  } else {
    memFallback = withStamp;
  }
}

export async function getQueue(): Promise<TravisPartsQueue> {
  return readQueue();
}

export interface AddToQueueInput {
  sku: string;
  name: string;
  price: number;
}

/**
 * Append a SKU to the queue, or merge into an existing line if the SKU is
 * already present. The original `priceAtAdd` / `nameAtAdd` snapshots are kept
 * on merge — mid-queue catalog price changes must not alter already-queued
 * lines.
 */
export async function addToQueue(input: AddToQueueInput, qty: number): Promise<void> {
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error(`qty must be a positive number (got ${qty})`);
  }
  const sku = input.sku.trim().toUpperCase();
  const queue = await readQueue();
  const existing = queue.lineItems.find(li => li.sku === sku);
  let nextItems: TravisQueueLineItem[];
  if (existing) {
    nextItems = queue.lineItems.map(li =>
      li.sku === sku ? { ...li, qty: li.qty + qty } : li
    );
  } else {
    const newLine: TravisQueueLineItem = {
      sku,
      qty,
      priceAtAdd: input.price,
      nameAtAdd: input.name.trim(),
      addedAt: new Date().toISOString(),
    };
    nextItems = [...queue.lineItems, newLine];
  }
  await writeQueue({ ...queue, lineItems: nextItems });
}

/** Set a specific line's qty. If qty <= 0, remove the line. No-op for unknown SKU. */
export async function setLineItemQty(sku: string, qty: number): Promise<void> {
  const normalized = sku.trim().toUpperCase();
  const queue = await readQueue();
  if (!queue.lineItems.some(li => li.sku === normalized)) return;
  const nextItems = qty <= 0
    ? queue.lineItems.filter(li => li.sku !== normalized)
    : queue.lineItems.map(li => li.sku === normalized ? { ...li, qty } : li);
  await writeQueue({ ...queue, lineItems: nextItems });
}

export async function removeLineItem(sku: string): Promise<void> {
  const normalized = sku.trim().toUpperCase();
  const queue = await readQueue();
  const nextItems = queue.lineItems.filter(li => li.sku !== normalized);
  await writeQueue({ ...queue, lineItems: nextItems });
}

/** Empty the queue and drop any suffix override. */
export async function clearQueue(): Promise<void> {
  await writeQueue(emptyQueue());
}

/** Set or clear the PO suffix override. Pass `undefined` or `''` to clear. */
export async function setSuffixOverride(suffix: string | undefined): Promise<void> {
  const queue = await readQueue();
  const trimmed = suffix?.trim();
  const next: TravisPartsQueue = {
    ...queue,
    suffixOverride: trimmed && trimmed.length > 0 ? trimmed : undefined,
  };
  await writeQueue(next);
}
