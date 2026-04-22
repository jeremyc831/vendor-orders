import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TravisOrderData } from '@/types/travis-order';

const sentMail: Array<Record<string, unknown>> = [];
const savedOrders: Array<Record<string, unknown>> = [];

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn(async (opts: Record<string, unknown>) => {
        sentMail.push(opts);
        return { messageId: 'fake' };
      }),
    }),
  },
}));

vi.mock('@/lib/kv', () => ({
  saveOrder: vi.fn(async (order: Record<string, unknown>) => {
    savedOrders.push(order);
  }),
}));

import { sendTravisOrder } from '../travis-submit';

function sampleData(flow: 'stoves' | 'parts' = 'stoves'): TravisOrderData {
  return {
    flow,
    dealerInfo: {
      dealerName: 'Hibernation Stoves & Spas',
      dealerNumber: 'CA419',
      orderedBy: 'Jeremy Carlson',
      email: 'jeremy@hibernation.com',
      shippingAddress: '2122 Highway 49 Suite D, Angels Camp, CA 95222',
      phone: '209-795-4339',
      poNumber: '042226STOCK',
      orderDate: '2026-04-22',
      paymentMethod: 'Invoice',
    },
    lineItems: [
      { sku: 'X1', name: 'Test', qty: 1, unitPrice: 10, lineTotal: 10 },
    ],
    orderNotes: 'SHIP COMPLETE',
    shipMethod: 'UPS Ground',
    subtotal: 10,
    freight: 0,
    total: 10,
  };
}

beforeEach(() => {
  sentMail.length = 0;
  savedOrders.length = 0;
});

describe('sendTravisOrder', () => {
  it('sends to saleswest@ with cc to info+jeremy', async () => {
    await sendTravisOrder(sampleData('stoves'), { vendor: 'travis-stoves' });
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].to).toBe('saleswest@travisindustries.com');
    expect(sentMail[0].cc).toEqual(['info@hibernation.com', 'jeremy@hibernation.com']);
  });

  it('attaches a PDF', async () => {
    await sendTravisOrder(sampleData('stoves'), { vendor: 'travis-stoves' });
    const attachments = sentMail[0].attachments as Array<Record<string, unknown>>;
    expect(attachments).toHaveLength(1);
    expect(attachments[0].contentType).toBe('application/pdf');
    expect(String(attachments[0].filename)).toMatch(/^Hibernation_PO_042226STOCK_Travis_/);
  });

  it('saves the order to history with the given vendor tag', async () => {
    const result = await sendTravisOrder(sampleData('parts'), { vendor: 'travis-parts' });
    expect(result.orderId).toBeDefined();
    expect(savedOrders).toHaveLength(1);
    expect(savedOrders[0].vendor).toBe('travis-parts');
    expect(savedOrders[0].type).toBe('stove');
    expect(savedOrders[0].description).toMatch(/^Travis Parts/);
  });

  it('uses "Stoves" in description for stoves flow', async () => {
    await sendTravisOrder(sampleData('stoves'), { vendor: 'travis-stoves' });
    expect(savedOrders[0].description).toMatch(/^Travis Stoves/);
  });

  it('subject line matches flow', async () => {
    await sendTravisOrder(sampleData('stoves'), { vendor: 'travis-stoves' });
    expect(String(sentMail[0].subject)).toContain('Travis Stoves');

    sentMail.length = 0;
    await sendTravisOrder(sampleData('parts'), { vendor: 'travis-parts' });
    expect(String(sentMail[0].subject)).toContain('Travis Parts');
  });

  it('rejects an empty line-item list', async () => {
    const data = { ...sampleData('parts'), lineItems: [] };
    await expect(sendTravisOrder(data, { vendor: 'travis-parts' })).rejects.toThrow();
  });
});
