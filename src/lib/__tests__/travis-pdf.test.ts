import { describe, it, expect } from 'vitest';
import { generateTravisPdf } from '../travis-pdf';
import type { TravisOrderData } from '@/types/travis-order';

function sampleData(overrides?: Partial<TravisOrderData>): TravisOrderData {
  const base: TravisOrderData = {
    flow: 'stoves',
    dealerInfo: {
      dealerName: 'Hibernation Stoves & Spas',
      dealerNumber: 'CA419',
      orderedBy: 'Jeremy Carlson',
      email: 'jeremy@hibernation.com',
      shippingAddress: '2122 Highway 49 Suite D, Angels Camp, CA 95222',
      phone: '209-795-4339',
      poNumber: '042226SMITH',
      orderDate: '2026-04-22',
      paymentMethod: 'Invoice',
    },
    lineItems: [
      { sku: '98500277', name: '564 TRV 25K Deluxe GSR2', qty: 1, unitPrice: 2145, lineTotal: 2145 },
      { sku: '94500624', name: 'LOG SET, FPL 36 564 DLX BIRCH', qty: 2, unitPrice: 236, lineTotal: 472 },
    ],
    orderNotes: 'SHIP COMPLETE',
    shipMethod: 'LTL',
    subtotal: 2617,
    freight: 0,
    total: 2617,
  };
  return { ...base, ...overrides };
}

describe('generateTravisPdf', () => {
  it('produces non-empty PDF bytes', () => {
    const bytes = generateTravisPdf(sampleData());
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
    // PDF files start with "%PDF-"
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('does not throw with empty notes and single line item', () => {
    const data = sampleData({
      orderNotes: '',
      lineItems: [{ sku: 'A', name: 'A', qty: 1, unitPrice: 1, lineTotal: 1 }],
      subtotal: 1,
      total: 1,
    });
    expect(() => generateTravisPdf(data)).not.toThrow();
  });

  it('handles freight > 0', () => {
    const data = sampleData({ freight: 150, total: 2767 });
    const bytes = generateTravisPdf(data);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
