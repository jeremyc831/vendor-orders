/**
 * Core types for Travis Industries ordering.
 * See docs/superpowers/specs/2026-04-21-travis-industries-ordering-design.md
 */

export type TravisCategoryClass = 'stoves' | 'parts';

/** A single SKU in the Travis catalog (stove, fireplace, insert, log set, or random part). */
export interface TravisProduct {
  /** Primary key — the SKU the user types to add to an order. */
  sku: string;
  /** Product display name, as it appears in the catalog. */
  name: string;
  /** Tier 4 dealer price (the 50% column for anchor products; Cost column for sub-items). */
  price: number;
  /** Optional category/section label from the catalog, for grouping. */
  category?: string;
  /** Optional brand — Lopi, Avalon, FPX, DaVinci, etc. */
  brand?: string;
  /** Ship weight in pounds, when the catalog specifies it. */
  weightLbs?: number;
  /** Where this SKU came from — 'pricelist' for generated entries, 'manual' for hand-added. */
  source: 'pricelist' | 'manual';
  /** ISO date (YYYY-MM-DD) of last catalog write. */
  lastUpdated: string;
}

/** A line item inside the weekly parts queue. */
export interface TravisQueueLineItem {
  sku: string;
  qty: number;
  /** Snapshot — the price at the moment the item was added. Price updates to the catalog do not mutate this. */
  priceAtAdd: number;
  /** Snapshot of display name for UI stability. */
  nameAtAdd: string;
  /** ISO timestamp for sorting/display. */
  addedAt: string;
}

/** The persistent weekly queue — stored under KV key `travis-parts-queue`. */
export interface TravisPartsQueue {
  lineItems: TravisQueueLineItem[];
  /** User-set override for the PO suffix. Defaults to 'Stock' at submit time. */
  suffixOverride?: string;
  lastUpdated: string;
}
