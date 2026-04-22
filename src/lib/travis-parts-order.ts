/**
 * Pure helper: builds a TravisOrderData payload from the current queue.
 * Used by both the user-triggered Submit-now endpoint and the Thursday cron.
 *
 * Kept out of any route.ts file so both can import without the antipattern of
 * cross-route-module imports.
 */
import { defaultTravisDealer } from '@/data/dealer';
import { DEFAULT_SUPPLY_SHIP_TO, DEFAULT_SUPPLY_SHIP_METHOD } from '@/data/shipping';
import { generateTravisPO } from './travis-po';
import type { TravisPartsQueue } from '@/types/travis';
import type { TravisOrderData, TravisOrderLineItem } from '@/types/travis-order';

export function buildPartsOrderData(queue: TravisPartsQueue): TravisOrderData {
  const orderDate = new Date().toISOString().split('T')[0];
  const rawSuffix = queue.suffixOverride?.trim();
  const suffix = rawSuffix && rawSuffix.length > 0 ? rawSuffix : 'Stock';
  const poNumber = generateTravisPO(orderDate, suffix);

  const lineItems: TravisOrderLineItem[] = queue.lineItems.map(li => ({
    sku: li.sku,
    name: li.nameAtAdd,
    qty: li.qty,
    unitPrice: li.priceAtAdd,
    lineTotal: li.priceAtAdd * li.qty,
  }));

  const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
  const freight = 0;
  const total = subtotal + freight;

  return {
    flow: 'parts',
    dealerInfo: {
      ...defaultTravisDealer,
      orderDate,
      poNumber,
      shippingAddress: DEFAULT_SUPPLY_SHIP_TO,
    },
    lineItems,
    orderNotes: 'SHIP COMPLETE',
    shipMethod: DEFAULT_SUPPLY_SHIP_METHOD,
    subtotal,
    freight,
    total,
  };
}
