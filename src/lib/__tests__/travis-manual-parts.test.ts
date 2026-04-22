import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TravisProduct } from '@/types/travis';

// In-memory fake store we control per test.
const memStore: Record<string, unknown> = {};

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(async (key: string) => memStore[key] ?? null),
    set: vi.fn(async (key: string, val: unknown) => { memStore[key] = val; }),
  },
}));

import {
  getPendingManualParts,
  addPendingManualPart,
  mergeCatalogWithPending,
} from '../travis-manual-parts';

beforeEach(() => {
  for (const k of Object.keys(memStore)) delete memStore[k];
  // Force KV path for these tests.
  process.env.KV_REST_API_URL = 'http://fake';
  process.env.KV_REST_API_TOKEN = 'fake';
});

describe('getPendingManualParts', () => {
  it('returns empty array when nothing stored', async () => {
    const result = await getPendingManualParts();
    expect(result).toEqual([]);
  });

  it('returns stored parts', async () => {
    memStore['travis-parts-manual-pending'] = [
      { sku: 'X1', name: 'Test', price: 10, source: 'manual', lastUpdated: '2026-04-22' },
    ];
    const result = await getPendingManualParts();
    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe('X1');
  });
});

describe('addPendingManualPart', () => {
  it('appends a new SKU', async () => {
    const added = await addPendingManualPart({ sku: 'ABC', name: 'Widget', price: 12 });
    expect(added.sku).toBe('ABC');
    expect(added.source).toBe('manual');
    expect(added.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const stored = memStore['travis-parts-manual-pending'] as TravisProduct[];
    expect(stored).toHaveLength(1);
    expect(stored[0].sku).toBe('ABC');
  });

  it('dedupes by SKU — later write wins', async () => {
    await addPendingManualPart({ sku: 'ABC', name: 'Widget', price: 12 });
    await addPendingManualPart({ sku: 'ABC', name: 'Widget v2', price: 15 });

    const stored = memStore['travis-parts-manual-pending'] as TravisProduct[];
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Widget v2');
    expect(stored[0].price).toBe(15);
  });

  it('normalizes SKU to uppercase for dedupe', async () => {
    await addPendingManualPart({ sku: 'abc', name: 'Lower', price: 10 });
    await addPendingManualPart({ sku: 'ABC', name: 'Upper', price: 20 });

    const stored = memStore['travis-parts-manual-pending'] as TravisProduct[];
    expect(stored).toHaveLength(1);
    expect(stored[0].sku).toBe('ABC');
  });
});

describe('mergeCatalogWithPending', () => {
  it('returns catalog unchanged when no pending', async () => {
    const catalog: TravisProduct[] = [
      { sku: 'A', name: 'CatalogA', price: 1, source: 'pricelist', lastUpdated: '2026-01-01' },
    ];
    const result = await mergeCatalogWithPending(catalog);
    expect(result).toEqual(catalog);
  });

  it('pending entries win on SKU collision', async () => {
    memStore['travis-parts-manual-pending'] = [
      { sku: 'A', name: 'PendingA', price: 99, source: 'manual', lastUpdated: '2026-04-22' },
    ];
    const catalog: TravisProduct[] = [
      { sku: 'A', name: 'CatalogA', price: 1, source: 'pricelist', lastUpdated: '2026-01-01' },
      { sku: 'B', name: 'CatalogB', price: 2, source: 'pricelist', lastUpdated: '2026-01-01' },
    ];
    const result = await mergeCatalogWithPending(catalog);
    expect(result).toHaveLength(2);
    const a = result.find(p => p.sku === 'A');
    expect(a?.name).toBe('PendingA');
    expect(a?.source).toBe('manual');
  });
});
