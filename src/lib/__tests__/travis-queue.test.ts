import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TravisPartsQueue } from '@/types/travis';

const memStore: Record<string, unknown> = {};

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(async (key: string) => memStore[key] ?? null),
    set: vi.fn(async (key: string, val: unknown) => { memStore[key] = val; }),
    del: vi.fn(async (key: string) => { delete memStore[key]; }),
  },
}));

import {
  getQueue,
  addToQueue,
  setLineItemQty,
  removeLineItem,
  clearQueue,
  setSuffixOverride,
} from '../travis-queue';

beforeEach(() => {
  for (const k of Object.keys(memStore)) delete memStore[k];
  process.env.KV_REST_API_URL = 'http://fake';
  process.env.KV_REST_API_TOKEN = 'fake';
});

describe('getQueue', () => {
  it('returns an empty queue when nothing is stored', async () => {
    const q = await getQueue();
    expect(q.lineItems).toEqual([]);
    expect(q.suffixOverride).toBeUndefined();
  });

  it('returns the stored queue', async () => {
    memStore['travis-parts-queue'] = {
      lineItems: [
        { sku: 'A1', qty: 2, priceAtAdd: 10, nameAtAdd: 'Thing', addedAt: '2026-04-22T10:00:00.000Z' },
      ],
      lastUpdated: '2026-04-22T10:00:00.000Z',
    } satisfies TravisPartsQueue;

    const q = await getQueue();
    expect(q.lineItems).toHaveLength(1);
    expect(q.lineItems[0].sku).toBe('A1');
    expect(q.lineItems[0].qty).toBe(2);
  });
});

describe('addToQueue', () => {
  it('appends a new SKU', async () => {
    await addToQueue({ sku: 'A1', name: 'Thing', price: 10 }, 3);
    const q = await getQueue();
    expect(q.lineItems).toHaveLength(1);
    expect(q.lineItems[0]).toMatchObject({
      sku: 'A1',
      qty: 3,
      priceAtAdd: 10,
      nameAtAdd: 'Thing',
    });
    expect(q.lineItems[0].addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('normalizes SKU to uppercase', async () => {
    await addToQueue({ sku: 'abc', name: 'Lower', price: 5 }, 1);
    const q = await getQueue();
    expect(q.lineItems[0].sku).toBe('ABC');
  });

  it('merges qty when adding the same SKU again (original price snapshot kept)', async () => {
    await addToQueue({ sku: 'A1', name: 'Thing', price: 10 }, 2);
    await addToQueue({ sku: 'A1', name: 'Thing v2', price: 999 }, 3);
    const q = await getQueue();
    expect(q.lineItems).toHaveLength(1);
    expect(q.lineItems[0].qty).toBe(5);
    expect(q.lineItems[0].priceAtAdd).toBe(10);
    expect(q.lineItems[0].nameAtAdd).toBe('Thing');
  });

  it('rejects qty <= 0', async () => {
    await expect(addToQueue({ sku: 'A1', name: 'X', price: 1 }, 0)).rejects.toThrow();
    await expect(addToQueue({ sku: 'A1', name: 'X', price: 1 }, -1)).rejects.toThrow();
  });
});

describe('setLineItemQty', () => {
  it('updates qty for an existing SKU', async () => {
    await addToQueue({ sku: 'A1', name: 'Thing', price: 10 }, 1);
    await setLineItemQty('A1', 7);
    const q = await getQueue();
    expect(q.lineItems[0].qty).toBe(7);
  });

  it('normalizes SKU lookup to uppercase', async () => {
    await addToQueue({ sku: 'A1', name: 'Thing', price: 10 }, 1);
    await setLineItemQty('a1', 4);
    const q = await getQueue();
    expect(q.lineItems[0].qty).toBe(4);
  });

  it('removes the line item when qty becomes 0', async () => {
    await addToQueue({ sku: 'A1', name: 'Thing', price: 10 }, 1);
    await setLineItemQty('A1', 0);
    const q = await getQueue();
    expect(q.lineItems).toEqual([]);
  });

  it('is a no-op for unknown SKU', async () => {
    await addToQueue({ sku: 'A1', name: 'Thing', price: 10 }, 1);
    await setLineItemQty('MISSING', 5);
    const q = await getQueue();
    expect(q.lineItems).toHaveLength(1);
    expect(q.lineItems[0].sku).toBe('A1');
  });
});

describe('removeLineItem', () => {
  it('removes the given SKU', async () => {
    await addToQueue({ sku: 'A1', name: 'A', price: 1 }, 1);
    await addToQueue({ sku: 'B1', name: 'B', price: 2 }, 1);
    await removeLineItem('A1');
    const q = await getQueue();
    expect(q.lineItems).toHaveLength(1);
    expect(q.lineItems[0].sku).toBe('B1');
  });
});

describe('clearQueue', () => {
  it('empties everything', async () => {
    await addToQueue({ sku: 'A1', name: 'A', price: 1 }, 1);
    await setSuffixOverride('Job42');
    await clearQueue();
    const q = await getQueue();
    expect(q.lineItems).toEqual([]);
    expect(q.suffixOverride).toBeUndefined();
  });
});

describe('setSuffixOverride', () => {
  it('stores a suffix', async () => {
    await setSuffixOverride('Job42');
    const q = await getQueue();
    expect(q.suffixOverride).toBe('Job42');
  });

  it('clears the suffix when passed undefined or empty string', async () => {
    await setSuffixOverride('Job42');
    await setSuffixOverride(undefined);
    const q = await getQueue();
    expect(q.suffixOverride).toBeUndefined();
  });
});
