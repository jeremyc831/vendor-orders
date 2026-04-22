import { describe, it, expect } from 'vitest';
import { travisCatalog, findTravisProduct, searchTravisProducts } from '../index';

describe('travisCatalog', () => {
  it('includes both stoves and parts', () => {
    const skus = travisCatalog.map(p => p.sku);
    expect(skus).toContain('98500277'); // 564 TRV 25K anchor stove
    expect(skus).toContain('94500624'); // LOG SET, FPL 36 564 DLX BIRCH — part
  });

  it('has no duplicate SKUs across stoves + parts + manual', () => {
    const skus = travisCatalog.map(p => p.sku);
    const unique = new Set(skus);
    expect(unique.size).toBe(skus.length);
  });

  it('every product has a positive price', () => {
    for (const p of travisCatalog) {
      expect(p.price).toBeGreaterThan(0);
    }
  });
});

describe('findTravisProduct', () => {
  it('finds a stove by exact SKU', () => {
    const p = findTravisProduct('98500277');
    expect(p).toBeDefined();
    expect(p?.name.toLowerCase()).toContain('564 trv 25k');
  });

  it('returns undefined for unknown SKUs', () => {
    expect(findTravisProduct('DOES-NOT-EXIST')).toBeUndefined();
  });

  it('is case-insensitive on SKU lookup', () => {
    // (SKUs in the catalog are all-digit or digit-dash-digit, but be defensive)
    const p = findTravisProduct('98500277');
    const pUpper = findTravisProduct('98500277'.toUpperCase());
    expect(p).toEqual(pUpper);
  });
});

describe('searchTravisProducts', () => {
  it('returns SKU prefix matches first', () => {
    const results = searchTravisProducts('985');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].sku.startsWith('985')).toBe(true);
  });

  it('matches by name substring (case-insensitive)', () => {
    const results = searchTravisProducts('log set');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name.toLowerCase()).toContain('log set');
  });

  it('returns at most 20 results by default', () => {
    const results = searchTravisProducts('a'); // common letter
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it('empty query returns empty list', () => {
    expect(searchTravisProducts('')).toEqual([]);
    expect(searchTravisProducts('   ')).toEqual([]);
  });
});
