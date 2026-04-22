import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildPartsOrderData } from '../travis-parts-order';
import type { TravisPartsQueue } from '@/types/travis';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-22T15:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function sampleQueue(overrides?: Partial<TravisPartsQueue>): TravisPartsQueue {
  return {
    lineItems: [
      { sku: 'A1', qty: 2, priceAtAdd: 10, nameAtAdd: 'Thing', addedAt: '2026-04-20T10:00:00.000Z' },
      { sku: 'B2', qty: 1, priceAtAdd: 25.5, nameAtAdd: 'Other', addedAt: '2026-04-21T10:00:00.000Z' },
    ],
    lastUpdated: '2026-04-22T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildPartsOrderData', () => {
  it('produces a parts-flow TravisOrderData with today as order date', () => {
    const data = buildPartsOrderData(sampleQueue());
    expect(data.flow).toBe('parts');
    expect(data.dealerInfo.orderDate).toBe('2026-04-22');
  });

  it('defaults PO suffix to Stock when no override', () => {
    const data = buildPartsOrderData(sampleQueue());
    expect(data.dealerInfo.poNumber).toBe('042226STOCK');
  });

  it('uses queue.suffixOverride when present', () => {
    const data = buildPartsOrderData(sampleQueue({ suffixOverride: 'Job42' }));
    expect(data.dealerInfo.poNumber).toBe('042226JOB42');
  });

  it('falls back to Stock when suffixOverride is whitespace', () => {
    const data = buildPartsOrderData(sampleQueue({ suffixOverride: '   ' }));
    expect(data.dealerInfo.poNumber).toBe('042226STOCK');
  });

  it('maps queue lineItems to TravisOrderLineItems (qty × priceAtAdd)', () => {
    const data = buildPartsOrderData(sampleQueue());
    expect(data.lineItems).toEqual([
      { sku: 'A1', name: 'Thing', qty: 2, unitPrice: 10, lineTotal: 20 },
      { sku: 'B2', name: 'Other', qty: 1, unitPrice: 25.5, lineTotal: 25.5 },
    ]);
  });

  it('computes subtotal / freight / total — freight 0, total = subtotal', () => {
    const data = buildPartsOrderData(sampleQueue());
    expect(data.subtotal).toBe(45.5);
    expect(data.freight).toBe(0);
    expect(data.total).toBe(45.5);
  });

  it('uses the Arnold supply ship-to and UPS Ground', () => {
    const data = buildPartsOrderData(sampleQueue());
    expect(data.dealerInfo.shippingAddress).toMatch(/Arnold/);
    expect(data.shipMethod).toBe('UPS Ground');
  });

  it('includes SHIP COMPLETE as default order notes', () => {
    const data = buildPartsOrderData(sampleQueue());
    expect(data.orderNotes).toBe('SHIP COMPLETE');
  });
});
