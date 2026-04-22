/**
 * Types for Travis Industries order submissions.
 * One flow: Stoves (Plan 2). Parts flow reuses `TravisOrderLineItem` and extends shape (Plan 3).
 */

/** A single line item on a Travis order, snapshot at submit time. */
export interface TravisOrderLineItem {
  sku: string;
  name: string;
  qty: number;
  /** Unit price at the moment of order submission (snapshotted from catalog). */
  unitPrice: number;
  /** qty * unitPrice — precomputed for email/PDF rendering. */
  lineTotal: number;
}

/** How the PO suffix is chosen on the Travis Stoves form. */
export type TravisPoSuffixMode = 'lastName' | 'stock' | 'custom';

/** Payload POSTed to `/api/travis/send-stoves-order`. */
export interface TravisOrderData {
  /** Which Travis surface submitted — 'stoves' for Plan 2, 'parts' in Plan 3. */
  flow: 'stoves' | 'parts';
  dealerInfo: {
    dealerName: string;
    dealerNumber: string;
    orderedBy: string;
    email: string;
    shippingAddress: string;
    phone: string;
    poNumber: string;
    orderDate: string;
    paymentMethod: string;
  };
  lineItems: TravisOrderLineItem[];
  /** Free-text "Order notes" — defaults to 'SHIP COMPLETE' for stoves. */
  orderNotes: string;
  /** Method as user typed it (default 'LTL' for stoves, 'UPS Ground' for parts). */
  shipMethod: string;
  /** Subtotal = sum of lineTotals. */
  subtotal: number;
  /** Freight dollars, editable. Default 0 for stoves. */
  freight: number;
  /** Grand total = subtotal + freight (no discounts for Travis). */
  total: number;
}
