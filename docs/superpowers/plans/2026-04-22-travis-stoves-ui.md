# Travis Stoves UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Travis Industries **Stoves / Fireplaces** order page — a SKU-based, immediate-submit order flow that generates a PDF, emails it to `saleswest@travisindustries.com`, and stores the record in order history. At the end of this plan, Jeremy can open `/travis/stoves` from the home page, type a SKU (with live autocomplete), build a multi-line-item order, and submit it.

**Architecture:** Reuses the existing pattern of `/api/send-*-order` handlers (Gmail SMTP via nodemailer, KV-backed order history). A new reusable `TravisSkuAutocomplete` component drives the SKU entry experience — it fetches the full merged catalog (catalog module + KV pending manual parts) once on mount and does prefix + substring matching in-memory. Unknown SKUs are captured inline via an "Add new part" prompt that writes to KV (`travis-parts-manual-pending`) and is picked up on the next `npm run import:travis` / GitHub Actions sync (Plan 3). A Travis-specific PDF generator mirrors `src/lib/pdf.ts` but uses a line-item table instead of the spa configuration table.

**Tech Stack:** TypeScript, Next.js 16 App Router (⚠ treat as unfamiliar — see `node_modules/next/dist/docs/` and existing handlers in `src/app/api/` before writing new route handlers; `cookies()` is async in this version), React 19, Tailwind CSS v4, Vitest, jsPDF + jspdf-autotable, nodemailer, Vercel KV.

**Source doc:** [docs/superpowers/specs/2026-04-21-travis-industries-ordering-design.md](../specs/2026-04-21-travis-industries-ordering-design.md)

**Builds on:** [2026-04-21-travis-foundation-and-catalog.md](./2026-04-21-travis-foundation-and-catalog.md) (merged to main).

---

## File Structure

**New files:**
- `src/types/travis-order.ts` — `TravisOrderLineItem`, `TravisOrderData`, `TravisPoSuffixMode`
- `src/lib/travis-manual-parts.ts` — async helpers for the `travis-parts-manual-pending` KV list
- `src/lib/__tests__/travis-manual-parts.test.ts`
- `src/lib/travis-pdf.ts` — `generateTravisPdf(data)` — line-item-based PDF
- `src/lib/__tests__/travis-pdf.test.ts`
- `src/lib/travis-po.ts` — `generateTravisPO(date, suffix)` — non-last-name variant of the existing `generatePO`
- `src/lib/__tests__/travis-po.test.ts`
- `src/app/api/travis/catalog/route.ts` — GET merged catalog (catalog module + KV pending)
- `src/app/api/travis/add-manual-part/route.ts` — POST unknown SKU → KV
- `src/app/api/travis/send-stoves-order/route.ts` — POST submit stoves order
- `src/components/TravisSkuAutocomplete.tsx` — controlled SKU input + dropdown + unknown-SKU prompt
- `src/components/TravisOrderForm.tsx` — stoves order form: dealer info, PO suffix, shipping, line items, notes, summary, submit
- `src/app/travis/stoves/page.tsx` — Travis Stoves page (client component, uses `TravisOrderForm`)

**Modified files:**
- `src/app/page.tsx` — add "Travis Industries" section with Stoves / Parts nav cards
- `src/components/OrderHistory.tsx` — extend `vendorLabel` with `travis-stoves` and `travis-parts`

**NOT touched in this plan** (Plan 3):
- `src/app/travis/parts/page.tsx`
- `src/components/TravisPartsQueueCard.tsx`
- `src/lib/travis-queue.ts`
- Any `/api/travis/parts-*` routes
- `vercel.json` cron entries
- `.github/workflows/sync-travis-manual-parts.yml`

---

## Task 1: Travis order types

**Files:**
- Create: `src/types/travis-order.ts`

These types flow through the client form, the API handler, and the PDF generator. Defining them first lets subsequent tasks import without circularity.

- [ ] **Step 1: Create the types module**

Write `src/types/travis-order.ts`:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/travis-order.ts
git commit -m "Add Travis order types (TravisOrderLineItem, TravisOrderData)"
```

---

## Task 2: Manual-parts KV helper

**Files:**
- Create: `src/lib/travis-manual-parts.ts`
- Create: `src/lib/__tests__/travis-manual-parts.test.ts`

Isolates the KV key `travis-parts-manual-pending` behind typed helpers. The existing `src/lib/kv.ts` hides the "no KV creds → in-memory fallback" dance; we follow the same pattern here so tests can mock via `vi.mock`.

- [ ] **Step 1: Write failing tests first**

Write `src/lib/__tests__/travis-manual-parts.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to confirm failure**

Run:
```bash
npm test -- src/lib/__tests__/travis-manual-parts.test.ts
```

Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement the helper**

Write `src/lib/travis-manual-parts.ts`:

```ts
/**
 * KV-backed manual-parts helpers.
 *
 * Unknown SKUs typed into the Travis forms land in `travis-parts-manual-pending`.
 * A weekly GitHub Actions workflow (Plan 3) syncs those into
 * `src/data/travis/parts-manual.ts` and clears the KV list.
 *
 * Mirrors the `hasKV()` + in-memory fallback pattern from `src/lib/kv.ts` so
 * local dev without KV creds still works.
 */
import type { TravisProduct } from '@/types/travis';

const KEY = 'travis-parts-manual-pending';

// In-memory fallback for local dev without KV credentials.
let memFallback: TravisProduct[] = [];

function hasKV(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getKV() {
  const { kv } = await import('@vercel/kv');
  return kv;
}

export async function getPendingManualParts(): Promise<TravisProduct[]> {
  if (hasKV()) {
    const kv = await getKV();
    const stored = await kv.get<TravisProduct[]>(KEY);
    return stored ?? [];
  }
  return memFallback;
}

export interface AddPendingInput {
  sku: string;
  name: string;
  price: number;
  category?: string;
  brand?: string;
  weightLbs?: number;
}

/**
 * Add a pending manual part. Dedupes by uppercase SKU — later writes win.
 * Returns the stored entry (source='manual', lastUpdated=today).
 */
export async function addPendingManualPart(input: AddPendingInput): Promise<TravisProduct> {
  const today = new Date().toISOString().slice(0, 10);
  const normalizedSku = input.sku.trim().toUpperCase();
  const entry: TravisProduct = {
    sku: normalizedSku,
    name: input.name.trim(),
    price: input.price,
    category: input.category,
    brand: input.brand,
    weightLbs: input.weightLbs,
    source: 'manual',
    lastUpdated: today,
  };

  const existing = await getPendingManualParts();
  const filtered = existing.filter(p => p.sku.toUpperCase() !== normalizedSku);
  const updated = [...filtered, entry];

  if (hasKV()) {
    const kv = await getKV();
    await kv.set(KEY, updated);
  } else {
    memFallback = updated;
  }

  return entry;
}

/**
 * Merge the catalog with the KV pending list. Pending entries win on SKU
 * collision (they're the newest truth).
 */
export async function mergeCatalogWithPending(
  catalog: TravisProduct[]
): Promise<TravisProduct[]> {
  const pending = await getPendingManualParts();
  if (pending.length === 0) return catalog;

  const bySku = new Map<string, TravisProduct>();
  for (const p of catalog) bySku.set(p.sku.toUpperCase(), p);
  for (const p of pending) bySku.set(p.sku.toUpperCase(), p);
  return Array.from(bySku.values());
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run:
```bash
npm test -- src/lib/__tests__/travis-manual-parts.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/travis-manual-parts.ts src/lib/__tests__/travis-manual-parts.test.ts
git commit -m "Add travis-manual-parts KV helpers with tests"
```

---

## Task 3: Travis PO generator

**Files:**
- Create: `src/lib/travis-po.ts`
- Create: `src/lib/__tests__/travis-po.test.ts`

Travis POs use `MMDDYY<suffix>` where suffix is either LastName, `Stock`, or a freeform string. The existing `generatePO` in `src/lib/pricing.ts` hardcodes `lastName.toUpperCase()`. Rather than refactor that (spa flows work fine), we add a Travis-specific generator.

- [ ] **Step 1: Write failing tests**

Write `src/lib/__tests__/travis-po.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateTravisPO } from '../travis-po';

describe('generateTravisPO', () => {
  it('formats as MMDDYY + suffix uppercased', () => {
    expect(generateTravisPO('2026-04-22', 'Stock')).toBe('042226STOCK');
  });

  it('strips spaces from suffix', () => {
    expect(generateTravisPO('2026-04-22', 'Job 42')).toBe('042226JOB42');
  });

  it('accepts empty suffix (prefix only)', () => {
    expect(generateTravisPO('2026-04-22', '')).toBe('042226');
  });

  it('handles single-digit month and day with zero-padding from ISO date', () => {
    expect(generateTravisPO('2026-01-05', 'Smith')).toBe('010526SMITH');
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run:
```bash
npm test -- src/lib/__tests__/travis-po.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Write `src/lib/travis-po.ts`:

```ts
/**
 * Travis PO # generator.
 *
 * Format: MMDDYY + suffix (uppercased, spaces stripped).
 * Suffix is typically a customer last name, 'Stock', or a freeform string —
 * unlike the spa-flow `generatePO` in `src/lib/pricing.ts`, which assumes a
 * customer last name.
 */
export function generateTravisPO(orderDate: string, suffix: string): string {
  const [year, month, day] = orderDate.split('-');
  const yy = year.slice(-2);
  const prefix = `${month}${day}${yy}`;
  const cleanSuffix = suffix.replace(/\s+/g, '').toUpperCase();
  return `${prefix}${cleanSuffix}`;
}
```

- [ ] **Step 4: Verify pass**

Run:
```bash
npm test -- src/lib/__tests__/travis-po.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/travis-po.ts src/lib/__tests__/travis-po.test.ts
git commit -m "Add generateTravisPO (MMDDYY + suffix)"
```

---

## Task 4: Travis PDF generator

**Files:**
- Create: `src/lib/travis-pdf.ts`
- Create: `src/lib/__tests__/travis-pdf.test.ts`

Travis orders don't have a spa configuration; they have a list of SKU/qty/price line items. Pattern matches `src/lib/pdf.ts` (jsPDF + autoTable), but the spa config table is replaced by a line-item table.

- [ ] **Step 1: Write a smoke test (non-zero PDF bytes, includes key fields)**

Write `src/lib/__tests__/travis-pdf.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to confirm fail**

Run:
```bash
npm test -- src/lib/__tests__/travis-pdf.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the generator**

Write `src/lib/travis-pdf.ts`:

```ts
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TravisOrderData } from '@/types/travis-order';

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function generateTravisPdf(data: TravisOrderData): Uint8Array {
  const doc = new jsPDF({ format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const title = data.flow === 'stoves'
    ? 'Travis Industries — Stoves / Fireplaces Order'
    : 'Travis Industries — Parts Order';

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 22);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`PO #: ${data.dealerInfo.poNumber}`, pageWidth - 14, 22, { align: 'right' });
  doc.text(`Date: ${data.dealerInfo.orderDate}`, pageWidth - 14, 28, { align: 'right' });

  // Dealer info table
  autoTable(doc, {
    startY: 35,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 } },
    body: [
      ['PO #:', data.dealerInfo.poNumber],
      ['Dealer:', `${data.dealerInfo.dealerName} (#${data.dealerInfo.dealerNumber})`],
      ['Ordered By:', `${data.dealerInfo.orderedBy} (${data.dealerInfo.email})`],
      ['Ship To:', data.dealerInfo.shippingAddress],
      ['Ship Method:', data.shipMethod],
      ['Phone:', data.dealerInfo.phone],
      ['Payment:', data.dealerInfo.paymentMethod],
    ],
  });

  const afterDealer =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 75;

  // Line items table
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Items Ordered', 14, afterDealer + 12);

  const itemRows = data.lineItems.map(item => [
    item.sku,
    item.name,
    String(item.qty),
    formatMoney(item.unitPrice),
    formatMoney(item.lineTotal),
  ]);

  autoTable(doc, {
    startY: afterDealer + 16,
    theme: 'striped',
    headStyles: { fillColor: [21, 101, 166] },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 30 },  // SKU
      2: { cellWidth: 15, halign: 'center' },  // Qty
      3: { cellWidth: 25, halign: 'right' },   // Unit
      4: { cellWidth: 25, halign: 'right' },   // Total
    },
    head: [['SKU', 'Description', 'Qty', 'Unit', 'Line Total']],
    body: itemRows,
    foot: [
      [
        { content: 'Subtotal', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatMoney(data.subtotal), styles: { halign: 'right', fontStyle: 'bold' } },
      ],
      ...(data.freight > 0 ? [[
        { content: 'Freight', colSpan: 4, styles: { halign: 'right' } },
        { content: formatMoney(data.freight), styles: { halign: 'right' } },
      ]] : []),
      [
        { content: 'Total', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [230, 230, 230] } },
        { content: formatMoney(data.total), styles: { halign: 'right', fontStyle: 'bold', fillColor: [230, 230, 230] } },
      ],
    ],
  });

  const afterItems =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 160;

  // Order notes
  if (data.orderNotes) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Order Notes:', 14, afterItems + 10);
    doc.setFont('helvetica', 'normal');
    doc.text(data.orderNotes, 14, afterItems + 16, { maxWidth: pageWidth - 28 });
  }

  // Confirmation notice
  const noticeY = data.orderNotes ? afterItems + 30 : afterItems + 12;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Please send order confirmations to:', 14, noticeY);
  doc.setFont('helvetica', 'normal');
  doc.text('info@hibernation.com and jeremy@hibernation.com', 14, noticeY + 5);

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('Generated by Hibernation Stoves & Spas Order System', 14, pageHeight - 10);

  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}
```

- [ ] **Step 4: Verify pass**

Run:
```bash
npm test -- src/lib/__tests__/travis-pdf.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/travis-pdf.ts src/lib/__tests__/travis-pdf.test.ts
git commit -m "Add generateTravisPdf (line-item-style PDF)"
```

---

## Task 5: `/api/travis/catalog` endpoint

**Files:**
- Create: `src/app/api/travis/catalog/route.ts`

Returns the full merged catalog (module catalog + KV pending manual parts) as a JSON array. Consumed by `TravisSkuAutocomplete` on mount.

⚠ **Next.js 16 note:** Before editing, skim an existing route handler such as `src/app/api/orders/route.ts` to confirm the current `GET` signature in this version. Do not assume older Next.js patterns.

- [ ] **Step 1: Implement the route handler**

Write `src/app/api/travis/catalog/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { travisCatalog } from '@/data/travis';
import { mergeCatalogWithPending } from '@/lib/travis-manual-parts';

export async function GET() {
  try {
    const merged = await mergeCatalogWithPending(travisCatalog);
    return NextResponse.json({ products: merged });
  } catch (err) {
    console.error('Travis catalog fetch failed:', err);
    return NextResponse.json({ error: 'Failed to load catalog' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Sanity-check typecheck + lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```

Expected: no errors, no new warnings.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/travis/catalog/route.ts
git commit -m "Add GET /api/travis/catalog (merged catalog + KV pending)"
```

---

## Task 6: `/api/travis/add-manual-part` endpoint

**Files:**
- Create: `src/app/api/travis/add-manual-part/route.ts`

POST `{ sku, name, price }` → stored in KV pending list → returned as a `TravisProduct`. Validates input, rejects duplicate SKU against the existing catalog (to keep the pending list clean).

- [ ] **Step 1: Write the handler**

Write `src/app/api/travis/add-manual-part/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { addPendingManualPart } from '@/lib/travis-manual-parts';
import { findTravisProduct } from '@/data/travis';

interface Payload {
  sku?: unknown;
  name?: unknown;
  price?: unknown;
  category?: unknown;
  brand?: unknown;
  weightLbs?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body: Payload = await request.json();

    const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const price = typeof body.price === 'number' && isFinite(body.price) ? body.price : NaN;

    if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 });
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'price must be a non-negative number' }, { status: 400 });
    }

    // If it already exists in the static catalog, reject — the user should just add it by SKU.
    if (findTravisProduct(sku)) {
      return NextResponse.json(
        { error: `SKU ${sku.toUpperCase()} is already in the catalog` },
        { status: 409 }
      );
    }

    const product = await addPendingManualPart({
      sku,
      name,
      price,
      category: typeof body.category === 'string' ? body.category : undefined,
      brand: typeof body.brand === 'string' ? body.brand : undefined,
      weightLbs: typeof body.weightLbs === 'number' ? body.weightLbs : undefined,
    });

    return NextResponse.json({ product });
  } catch (err) {
    console.error('add-manual-part failed:', err);
    return NextResponse.json({ error: 'Failed to save manual part' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/travis/add-manual-part/route.ts
git commit -m "Add POST /api/travis/add-manual-part (KV pending write)"
```

---

## Task 7: `TravisSkuAutocomplete` component

**Files:**
- Create: `src/components/TravisSkuAutocomplete.tsx`

Controlled SKU input + dropdown + unknown-SKU prompt. Owns:
- Catalog fetch on mount (from `/api/travis/catalog`)
- Local catalog state (so adding a manual part updates the list immediately)
- Filtered match list (prefix SKU first, then name substring)
- Keyboard nav: ↑/↓ highlight, Enter add-with-qty-1, Esc close
- Unknown-SKU inline form (name + price)

- [ ] **Step 1: Create the component**

Write `src/components/TravisSkuAutocomplete.tsx`:

```tsx
'use client';

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import type { TravisProduct } from '@/types/travis';

interface Props {
  /** Called when the user confirms a product (either by Enter on match or saving the unknown-SKU form). */
  onAdd: (product: TravisProduct, qty: number) => void;
  /** Optional placeholder hint. */
  placeholder?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default function TravisSkuAutocomplete({
  onAdd,
  placeholder = 'Enter SKU…',
}: Props) {
  const [catalog, setCatalog] = useState<TravisProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Unknown-SKU form state
  const [unknownMode, setUnknownMode] = useState(false);
  const [unknownName, setUnknownName] = useState('');
  const [unknownPrice, setUnknownPrice] = useState('');
  const [unknownSaving, setUnknownSaving] = useState(false);
  const [unknownError, setUnknownError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/travis/catalog');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { products: TravisProduct[] } = await res.json();
        if (!cancelled) {
          setCatalog(data.products);
          setCatalogLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setCatalogError(err instanceof Error ? err.message : 'Failed to load catalog');
          setCatalogLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const matches = useCallback((): TravisProduct[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const sku: TravisProduct[] = [];
    const name: TravisProduct[] = [];
    for (const p of catalog) {
      if (p.sku.toLowerCase().startsWith(q)) sku.push(p);
      else if (p.name.toLowerCase().includes(q)) name.push(p);
      if (sku.length >= 20) break;
    }
    return [...sku, ...name].slice(0, 20);
  }, [query, catalog])();

  const exactMatch = matches.find(p => p.sku.toLowerCase() === query.trim().toLowerCase());
  const noMatches = query.trim().length > 0 && matches.length === 0 && !catalogLoading;

  const commit = (product: TravisProduct) => {
    onAdd(product, 1);
    setQuery('');
    setHighlightedIdx(0);
    setDropdownOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setDropdownOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(i => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches.length > 0) {
        commit(matches[highlightedIdx] ?? matches[0]);
      } else if (exactMatch) {
        commit(exactMatch);
      } else if (noMatches) {
        setUnknownMode(true);
        setUnknownName('');
        setUnknownPrice('');
        setUnknownError(null);
      }
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  };

  const saveUnknown = async () => {
    const sku = query.trim();
    const name = unknownName.trim();
    const price = parseFloat(unknownPrice);
    if (!sku || !name || !isFinite(price) || price < 0) {
      setUnknownError('SKU, name, and a valid price are required');
      return;
    }
    setUnknownSaving(true);
    setUnknownError(null);
    try {
      const res = await fetch('/api/travis/add-manual-part', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, name, price }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const { product }: { product: TravisProduct } = await res.json();
      // Merge into local catalog so autocomplete finds it on next keystroke.
      setCatalog(prev => {
        const filtered = prev.filter(p => p.sku.toUpperCase() !== product.sku.toUpperCase());
        return [...filtered, product];
      });
      commit(product);
      setUnknownMode(false);
    } catch (err) {
      setUnknownError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setUnknownSaving(false);
    }
  };

  return (
    <div className="relative">
      <label className="block text-sm text-slate-400 mb-1">
        Add by SKU
        {catalogLoading && <span className="ml-2 text-xs text-slate-500">(loading catalog…)</span>}
        {catalogError && <span className="ml-2 text-xs text-red-400">{catalogError}</span>}
      </label>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setDropdownOpen(true); setHighlightedIdx(0); }}
        onFocus={() => setDropdownOpen(true)}
        onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={catalogLoading}
        className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white font-mono focus:border-brand focus:outline-none disabled:opacity-50"
      />

      {dropdownOpen && matches.length > 0 && !unknownMode && (
        <div className="absolute z-10 mt-1 w-full bg-card border border-card-border rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {matches.map((p, i) => (
            <button
              key={p.sku}
              onMouseDown={e => e.preventDefault() /* keep focus */}
              onClick={() => commit(p)}
              className={`w-full text-left px-3 py-2 flex items-start gap-3 transition ${
                i === highlightedIdx ? 'bg-brand/20 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span className="font-mono text-xs text-brand-light shrink-0 w-28">{p.sku}</span>
              <span className="flex-1 min-w-0 text-sm truncate">{p.name}</span>
              <span className="font-mono text-sm text-slate-400 shrink-0">{formatCurrency(p.price)}</span>
            </button>
          ))}
        </div>
      )}

      {noMatches && !unknownMode && (
        <div className="mt-2 text-sm">
          <span className="text-slate-400">No match for <span className="font-mono">{query}</span>. </span>
          <button
            type="button"
            onClick={() => { setUnknownMode(true); setUnknownName(''); setUnknownPrice(''); setUnknownError(null); }}
            className="text-brand-light hover:text-white underline transition"
          >
            Add as new part
          </button>
        </div>
      )}

      {unknownMode && (
        <div className="mt-3 p-3 rounded-lg border-2 border-dashed border-brand/50 bg-brand/5 space-y-3">
          <div className="text-sm">
            <span className="text-slate-400">Adding new SKU: </span>
            <span className="font-mono text-white">{query.toUpperCase()}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-0.5">Description <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={unknownName}
                onChange={e => setUnknownName(e.target.value)}
                className="w-full bg-input-bg border border-input-border rounded px-2 py-1.5 text-sm text-white focus:border-brand focus:outline-none"
                placeholder="What is it?"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-0.5">Unit Price <span className="text-red-400">*</span></label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={unknownPrice}
                onChange={e => setUnknownPrice(e.target.value)}
                className="w-full bg-input-bg border border-input-border rounded px-2 py-1.5 text-sm text-white focus:border-brand focus:outline-none"
                placeholder="0.00"
              />
            </div>
          </div>
          {unknownError && <div className="text-xs text-red-400">{unknownError}</div>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setUnknownMode(false)}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveUnknown}
              disabled={unknownSaving || !unknownName.trim() || !unknownPrice.trim()}
              className={`px-4 py-1.5 rounded text-sm font-medium transition ${
                !unknownSaving && unknownName.trim() && unknownPrice.trim()
                  ? 'bg-brand text-white hover:bg-brand-light'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {unknownSaving ? 'Saving…' : 'Add & insert'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```

Expected: no errors, no new warnings. (Existing lint warnings unrelated to this file may remain.)

- [ ] **Step 3: Commit**

```bash
git add src/components/TravisSkuAutocomplete.tsx
git commit -m "Add TravisSkuAutocomplete (SKU input + dropdown + unknown-SKU prompt)"
```

---

## Task 8: `/api/travis/send-stoves-order` endpoint

**Files:**
- Create: `src/app/api/travis/send-stoves-order/route.ts`

Accepts `TravisOrderData`, generates PDF, emails to `saleswest@travisindustries.com` with CC to info@ + jeremy@, saves a `StoredOrder` with `type: 'stove'`, `vendor: 'travis-stoves'`.

- [ ] **Step 1: Create the route**

Write `src/app/api/travis/send-stoves-order/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { generateTravisPdf } from '@/lib/travis-pdf';
import { saveOrder } from '@/lib/kv';
import type { StoredOrder } from '@/types/order-history';
import type { TravisOrderData } from '@/types/travis-order';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function buildEmailHtml(data: TravisOrderData): string {
  const itemRows = data.lineItems.map(item => `
    <tr>
      <td style="padding:4px 8px;border:1px solid #ddd;font-family:monospace;font-size:12px">${item.sku}</td>
      <td style="padding:4px 8px;border:1px solid #ddd">${item.name}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:center">${item.qty}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:right">$${item.unitPrice.toFixed(2)}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:right">$${item.lineTotal.toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#333">
      <h2 style="color:#1565a6;margin-bottom:4px">Travis Industries — Stoves / Fireplaces Order</h2>
      <p style="color:#666;margin-top:0">PO #${data.dealerInfo.poNumber} &middot; ${data.dealerInfo.orderDate}</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:4px 8px;font-weight:bold;width:130px">PO #</td><td style="padding:4px 8px">${data.dealerInfo.poNumber}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold">Dealer</td><td style="padding:4px 8px">${data.dealerInfo.dealerName} (#${data.dealerInfo.dealerNumber})</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold">Ordered By</td><td style="padding:4px 8px">${data.dealerInfo.orderedBy}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold">Ship To</td><td style="padding:4px 8px">${data.dealerInfo.shippingAddress}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold">Ship Method</td><td style="padding:4px 8px">${data.shipMethod}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold">Payment</td><td style="padding:4px 8px">${data.dealerInfo.paymentMethod}</td></tr>
      </table>

      <h3 style="color:#1565a6;border-bottom:2px solid #1565a6;padding-bottom:4px">Items Ordered</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:left">SKU</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:left">Description</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:center">Qty</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:right">Unit</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="padding:4px 8px;text-align:right;border:1px solid #ddd;font-weight:bold">Subtotal</td>
            <td style="padding:4px 8px;text-align:right;border:1px solid #ddd;font-weight:bold">$${data.subtotal.toFixed(2)}</td>
          </tr>
          ${data.freight > 0 ? `<tr>
            <td colspan="4" style="padding:4px 8px;text-align:right;border:1px solid #ddd">Freight</td>
            <td style="padding:4px 8px;text-align:right;border:1px solid #ddd">$${data.freight.toFixed(2)}</td>
          </tr>` : ''}
          <tr style="background:#f5f5f5">
            <td colspan="4" style="padding:6px 8px;text-align:right;border:1px solid #ddd;font-weight:bold">Total</td>
            <td style="padding:6px 8px;text-align:right;border:1px solid #ddd;font-weight:bold">$${data.total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      ${data.orderNotes ? `<p style="background:#f5f5f5;padding:12px;border-radius:4px"><strong>Order Notes:</strong> ${data.orderNotes}</p>` : ''}

      <p style="margin-top:20px;font-size:13px"><strong>Please send order confirmations to:</strong><br/>info@hibernation.com and jeremy@hibernation.com</p>

      <p style="color:#999;font-size:12px;margin-top:24px">Generated by Hibernation Stoves &amp; Spas Order System</p>
    </div>
  `;
}

export async function POST(request: NextRequest) {
  try {
    const data: TravisOrderData = await request.json();

    if (!data.lineItems || data.lineItems.length === 0) {
      return NextResponse.json({ error: 'No line items' }, { status: 400 });
    }
    if (!data.dealerInfo?.poNumber) {
      return NextResponse.json({ error: 'PO number required' }, { status: 400 });
    }

    const pdfBytes = generateTravisPdf(data);
    const filename = `Hibernation_PO_${data.dealerInfo.poNumber}_Travis_Stoves.pdf`;

    await transporter.sendMail({
      from: `"Hibernation Orders" <${process.env.GMAIL_USER}>`,
      to: 'saleswest@travisindustries.com',
      cc: ['info@hibernation.com', 'jeremy@hibernation.com'],
      subject: `New Order - Hibernation PO# ${data.dealerInfo.poNumber} - Travis Stoves`,
      html: buildEmailHtml(data),
      attachments: [
        { filename, content: Buffer.from(pdfBytes), contentType: 'application/pdf' },
      ],
    });

    // Save to order history (non-critical — email already sent).
    const orderId = crypto.randomUUID();
    const itemCount = data.lineItems.reduce((sum, i) => sum + i.qty, 0);
    const storedOrder: StoredOrder = {
      id: orderId,
      type: 'stove',
      vendor: 'travis-stoves',
      status: 'submitted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      poNumber: data.dealerInfo.poNumber,
      orderDate: data.dealerInfo.orderDate,
      orderedBy: data.dealerInfo.orderedBy,
      description: `Travis Stoves — ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
      total: data.total,
      freight: data.freight,
      orderData: data as unknown as Record<string, unknown>,
    };
    try {
      await saveOrder(storedOrder);
    } catch (kvError) {
      console.error('Failed to save Travis stoves order to KV (email sent):', kvError);
    }

    return NextResponse.json({ success: true, orderId });
  } catch (err) {
    console.error('Send Travis stoves order error:', err);
    const message = err instanceof Error ? err.message : 'Failed to send order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/travis/send-stoves-order/route.ts
git commit -m "Add POST /api/travis/send-stoves-order (PDF + email + history)"
```

---

## Task 9: `TravisOrderForm` component

**Files:**
- Create: `src/components/TravisOrderForm.tsx`

The stoves order form. Owns:
- Dealer info (starts from `defaultTravisDealer`, editable via disclosure)
- Customer last name (drives default PO suffix) + order date + PO suffix mode radio + freeform override
- Shipping address + method (defaults: Angels Camp, LTL)
- Line-item list (add via `TravisSkuAutocomplete`, edit qty inline, remove button)
- Order notes (prefilled `SHIP COMPLETE`)
- Freight input (default 0 for stoves)
- Submit button → POST to `/api/travis/send-stoves-order`
- Post-submit "success" card with option to start a new order

- [ ] **Step 1: Write the component**

Write `src/components/TravisOrderForm.tsx`:

```tsx
'use client';

import { useState, useMemo } from 'react';
import TravisSkuAutocomplete from './TravisSkuAutocomplete';
import { defaultTravisDealer, DEFAULT_TRAVIS_STOVES_FREIGHT } from '@/data/dealer';
import { generateTravisPO } from '@/lib/travis-po';
import type { TravisProduct } from '@/types/travis';
import type { TravisOrderLineItem, TravisOrderData, TravisPoSuffixMode } from '@/types/travis-order';
import type { DealerInfo } from '@/types/manufacturer';

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

interface Props {
  onOrderSent: () => void;
}

export default function TravisOrderForm({ onOrderSent }: Props) {
  const [dealerInfo, setDealerInfo] = useState<DealerInfo>({ ...defaultTravisDealer, orderDate: new Date().toISOString().split('T')[0] });
  const [showDealerEdit, setShowDealerEdit] = useState(false);
  const [lineItems, setLineItems] = useState<TravisOrderLineItem[]>([]);
  const [suffixMode, setSuffixMode] = useState<TravisPoSuffixMode>('lastName');
  const [customSuffix, setCustomSuffix] = useState('');
  const [orderNotes, setOrderNotes] = useState('SHIP COMPLETE');
  const [shipMethod, setShipMethod] = useState('LTL');
  const [freight, setFreight] = useState<number>(DEFAULT_TRAVIS_STOVES_FREIGHT);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null);
  const [sendError, setSendError] = useState<string>('');

  const suffix = useMemo(() => {
    if (suffixMode === 'stock') return 'Stock';
    if (suffixMode === 'custom') return customSuffix;
    return dealerInfo.lastName;
  }, [suffixMode, customSuffix, dealerInfo.lastName]);

  const poNumber = useMemo(() => {
    if (!suffix) return '';
    return generateTravisPO(dealerInfo.orderDate, suffix);
  }, [dealerInfo.orderDate, suffix]);

  const subtotal = useMemo(
    () => lineItems.reduce((sum, li) => sum + li.lineTotal, 0),
    [lineItems]
  );
  const total = subtotal + freight;

  const isComplete = lineItems.length > 0 && poNumber.length > 0 && dealerInfo.shippingAddress.trim().length > 0;

  const addLineItem = (product: TravisProduct, qty: number) => {
    setLineItems(prev => {
      const existingIdx = prev.findIndex(li => li.sku === product.sku);
      if (existingIdx !== -1) {
        const updated = [...prev];
        const existing = updated[existingIdx];
        const newQty = existing.qty + qty;
        updated[existingIdx] = {
          ...existing,
          qty: newQty,
          lineTotal: newQty * existing.unitPrice,
        };
        return updated;
      }
      return [
        ...prev,
        {
          sku: product.sku,
          name: product.name,
          qty,
          unitPrice: product.price,
          lineTotal: product.price * qty,
        },
      ];
    });
  };

  const updateQty = (sku: string, qty: number) => {
    setLineItems(prev => prev
      .map(li => li.sku === sku
        ? { ...li, qty: Math.max(0, qty), lineTotal: Math.max(0, qty) * li.unitPrice }
        : li
      )
      .filter(li => li.qty > 0)
    );
  };

  const removeLineItem = (sku: string) => {
    setLineItems(prev => prev.filter(li => li.sku !== sku));
  };

  const submit = async () => {
    if (!isComplete) return;
    setSending(true);
    setSendResult(null);
    setSendError('');

    const payload: TravisOrderData = {
      flow: 'stoves',
      dealerInfo: { ...dealerInfo, poNumber },
      lineItems,
      orderNotes,
      shipMethod,
      subtotal,
      freight,
      total,
    };

    try {
      const res = await fetch('/api/travis/send-stoves-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setSendResult('success');
      setTimeout(() => onOrderSent(), 1800);
    } catch (err) {
      setSendResult('error');
      setSendError(err instanceof Error ? err.message : 'Failed to send order');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Vendor badge */}
      <div className="flex justify-center">
        <div className="p-4 rounded-lg border-2 border-brand bg-brand/10 text-center inline-block">
          <div className="text-2xl font-bold text-white">Travis Industries</div>
          <div className="text-sm text-slate-400 mt-1">
            Dealer #{dealerInfo.dealerNumber} &middot; Stoves / Fireplaces
          </div>
        </div>
      </div>

      {/* Dealer info */}
      <section className="bg-card rounded-lg border border-card-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Dealer Information</h2>
          <button
            onClick={() => setShowDealerEdit(!showDealerEdit)}
            className="text-sm text-brand-light hover:text-white transition"
          >
            {showDealerEdit ? 'Collapse' : 'Edit Details'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Customer Last Name {suffixMode === 'lastName' && <span className="text-red-400">*</span>}
            </label>
            <input
              type="text"
              value={dealerInfo.lastName}
              onChange={e => setDealerInfo(prev => ({ ...prev, lastName: e.target.value }))}
              className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none"
              placeholder="Customer last name"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Order Date</label>
            <input
              type="date"
              value={dealerInfo.orderDate}
              onChange={e => setDealerInfo(prev => ({ ...prev, orderDate: e.target.value }))}
              className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">PO #</label>
            <div className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-slate-400 font-mono">
              {poNumber || '—'}
            </div>
          </div>
        </div>

        {/* PO suffix mode */}
        <div className="mt-4">
          <label className="block text-sm text-slate-400 mb-2">PO Suffix</label>
          <div className="flex flex-wrap gap-2 items-center">
            {(['lastName', 'stock', 'custom'] as const).map(m => (
              <label key={m} className={`px-3 py-1.5 rounded border cursor-pointer transition ${
                suffixMode === m
                  ? 'border-brand bg-brand/20 text-white'
                  : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
              }`}>
                <input
                  type="radio"
                  className="sr-only"
                  checked={suffixMode === m}
                  onChange={() => setSuffixMode(m)}
                />
                {m === 'lastName' ? 'Last Name' : m === 'stock' ? 'Stock' : 'Custom'}
              </label>
            ))}
            {suffixMode === 'custom' && (
              <input
                type="text"
                value={customSuffix}
                onChange={e => setCustomSuffix(e.target.value)}
                placeholder="Custom suffix"
                className="ml-2 bg-input-bg border border-input-border rounded px-3 py-1.5 text-white text-sm focus:border-brand focus:outline-none"
              />
            )}
          </div>
        </div>

        {showDealerEdit && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Dealer Name</label>
              <input type="text" value={dealerInfo.dealerName} onChange={e => setDealerInfo(prev => ({ ...prev, dealerName: e.target.value }))} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Dealer #</label>
              <input type="text" value={dealerInfo.dealerNumber} onChange={e => setDealerInfo(prev => ({ ...prev, dealerNumber: e.target.value }))} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Ordered By</label>
              <input type="text" value={dealerInfo.orderedBy} onChange={e => setDealerInfo(prev => ({ ...prev, orderedBy: e.target.value }))} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <input type="email" value={dealerInfo.email} onChange={e => setDealerInfo(prev => ({ ...prev, email: e.target.value }))} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-slate-400 mb-1">Shipping Address <span className="text-red-400">*</span></label>
              <input type="text" value={dealerInfo.shippingAddress} onChange={e => setDealerInfo(prev => ({ ...prev, shippingAddress: e.target.value }))} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Ship Method</label>
              <input type="text" value={shipMethod} onChange={e => setShipMethod(e.target.value)} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Phone</label>
              <input type="text" value={dealerInfo.phone} onChange={e => setDealerInfo(prev => ({ ...prev, phone: e.target.value }))} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Payment Method</label>
              <input type="text" value={dealerInfo.paymentMethod} readOnly className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-slate-500 cursor-not-allowed" />
            </div>
          </div>
        )}

        {!showDealerEdit && (
          <div className="mt-3 text-sm text-slate-400">
            Ship to: {dealerInfo.shippingAddress} &middot; {shipMethod} &middot; {dealerInfo.paymentMethod}
          </div>
        )}
      </section>

      {/* SKU entry */}
      <section className="bg-card rounded-lg border border-card-border p-6">
        <TravisSkuAutocomplete onAdd={addLineItem} placeholder="Type SKU (e.g. 98500277)…" />
      </section>

      {/* Line items */}
      {lineItems.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Items ({lineItems.length})</h2>
          <div className="space-y-2">
            {lineItems.map(li => (
              <div key={li.sku} className="bg-card rounded-lg border border-card-border px-4 py-3 flex items-center gap-3">
                <span className="font-mono text-xs text-brand-light w-28 shrink-0">{li.sku}</span>
                <span className="flex-1 text-sm text-white truncate">{li.name}</span>
                <span className="font-mono text-sm text-slate-400">{formatCurrency(li.unitPrice)}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQty(li.sku, li.qty - 1)}
                    className="w-8 h-8 rounded bg-slate-700 text-white hover:bg-slate-600 transition flex items-center justify-center text-lg font-bold"
                  >−</button>
                  <input
                    type="number"
                    value={li.qty}
                    onChange={e => updateQty(li.sku, parseInt(e.target.value) || 0)}
                    className="w-14 text-center bg-input-bg border border-input-border rounded px-1 py-1 text-white font-mono focus:border-brand focus:outline-none"
                    min={0}
                  />
                  <button
                    onClick={() => updateQty(li.sku, li.qty + 1)}
                    className="w-8 h-8 rounded bg-slate-700 text-white hover:bg-slate-600 transition flex items-center justify-center text-lg font-bold"
                  >+</button>
                </div>
                <span className="font-mono text-sm text-white w-20 text-right">{formatCurrency(li.lineTotal)}</span>
                <button
                  onClick={() => removeLineItem(li.sku)}
                  className="w-7 h-7 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 transition flex items-center justify-center"
                  title="Remove"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Order notes */}
      <section>
        <label className="block text-sm text-slate-400 mb-1">Order Notes</label>
        <textarea
          value={orderNotes}
          onChange={e => setOrderNotes(e.target.value)}
          rows={2}
          className="w-full bg-card border border-card-border rounded-lg px-4 py-3 text-white focus:border-brand focus:outline-none resize-y"
        />
      </section>

      {/* Summary */}
      {lineItems.length > 0 && (
        <section className="bg-card rounded-lg border border-card-border p-4 space-y-2">
          <div className="flex justify-between text-slate-300">
            <span>Subtotal ({lineItems.length} line{lineItems.length !== 1 ? 's' : ''})</span>
            <span className="font-mono">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-slate-300">
            <span>Freight</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">$</span>
              <input
                type="number"
                value={freight}
                onChange={e => setFreight(Number(e.target.value) || 0)}
                className="w-24 bg-input-bg border border-input-border rounded px-2 py-1 text-white text-right font-mono focus:border-brand focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-between text-white text-lg font-bold pt-2 border-t border-card-border">
            <span>Total</span>
            <span className="font-mono">{formatCurrency(total)}</span>
          </div>
        </section>
      )}

      {/* Submit */}
      <button
        onClick={submit}
        disabled={!isComplete || sending}
        className={`w-full font-semibold py-3 px-6 rounded-lg transition ${
          isComplete && !sending
            ? 'bg-brand hover:bg-brand-light text-white'
            : 'bg-slate-700 text-slate-500 cursor-not-allowed'
        }`}
      >
        {sending ? 'Sending Order…' : 'Submit Order'}
      </button>
      {!isComplete && (
        <p className="text-sm text-slate-500 text-center">
          {lineItems.length === 0 && 'Add at least one item. '}
          {!poNumber && 'PO suffix required (fill last name, pick Stock, or enter a custom suffix). '}
          {!dealerInfo.shippingAddress.trim() && 'Shipping address required.'}
        </p>
      )}
      {sendResult === 'success' && (
        <p className="text-sm text-green-400 text-center">Order sent to Travis. Confirmation CC'd to info@ and jeremy@.</p>
      )}
      {sendResult === 'error' && (
        <p className="text-sm text-red-400 text-center">{sendError || 'Failed to send order. Please try again.'}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```

Expected: clean (warnings pre-existing in unrelated files are OK).

- [ ] **Step 3: Commit**

```bash
git add src/components/TravisOrderForm.tsx
git commit -m "Add TravisOrderForm (dealer info, SKU entry, line items, submit)"
```

---

## Task 10: `/travis/stoves` page

**Files:**
- Create: `src/app/travis/stoves/page.tsx`

A thin client page wrapping `TravisOrderForm` with a back-to-home header link.

- [ ] **Step 1: Write the page**

Write `src/app/travis/stoves/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import TravisOrderForm from '@/components/TravisOrderForm';

export default function TravisStovesPage() {
  const router = useRouter();

  const goHome = () => router.push('/');

  return (
    <div className="min-h-screen">
      <header className="bg-card border-b border-card-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4 cursor-pointer" onClick={goHome}>
          <Image src="/hibernation-logo.png" alt="Hibernation" width={48} height={48} className="rounded" />
          <div>
            <h1 className="text-xl font-bold text-white">The Order Desk</h1>
            <p className="text-sm text-slate-400">Hibernation Stoves & Spas</p>
          </div>
        </div>
        <button
          onClick={goHome}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <TravisOrderForm onOrderSent={goHome} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/travis/stoves/page.tsx
git commit -m "Add /travis/stoves page"
```

---

## Task 11: Home page — Travis Industries section

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/OrderHistory.tsx`

Add a "Travis Industries" section with two nav cards (Stoves / Fireplaces, Parts) between Supplies and Order History, visible when nothing is selected. Also extend the OrderHistory vendor labels.

**Note:** The Parts card links to `/travis/parts` which is created in Plan 3. Until Plan 3 ships, clicking it will 404 — leave it wired this way (Next.js will handle the 404). Alternative: comment it out and re-enable in Plan 3. The plan below wires it live so Plan 3 only has to add the route.

- [ ] **Step 1: Add `travis-stoves` and `travis-parts` to OrderHistory vendor labels**

Edit `src/components/OrderHistory.tsx`. In the `vendorLabel` function, find:

```ts
const labels: Record<string, string> = {
  marquis: 'Marquis',
  sundance: 'Sundance',
  'marquis-accessories': 'Marquis Acc.',
  'total-fireplace': 'Total Fireplace',
};
```

Change to:

```ts
const labels: Record<string, string> = {
  marquis: 'Marquis',
  sundance: 'Sundance',
  'marquis-accessories': 'Marquis Acc.',
  'total-fireplace': 'Total Fireplace',
  'travis-stoves': 'Travis Stoves',
  'travis-parts': 'Travis Parts',
};
```

- [ ] **Step 2: Add Travis Industries section to home page**

Edit `src/app/page.tsx`.

First, add a `useRouter` import. At the top where `useState, useCallback, useMemo, useEffect` is imported from react, add below it:

```diff
 import { useState, useCallback, useMemo, useEffect } from 'react';
 import Image from 'next/image';
+import { useRouter } from 'next/navigation';
```

Then inside the `OrderPage` component, near the existing `const [orders, setOrders]` hooks, add:

```ts
  const router = useRouter();
```

Then, in the JSX, find the existing "Supplies Vendor Selection" section that starts with `{!manufacturer && !selectedAccessoryVendor && (` and ends with its `</section>`. Immediately after that `</section>`'s closing `)}`, add a new Travis section:

```tsx
        {/* Travis Industries — home screen */}
        {!manufacturer && !selectedAccessoryVendor && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Travis Industries</h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => router.push('/travis/stoves')}
                className="p-6 rounded-lg border-2 border-card-border bg-card text-slate-300 hover:border-slate-500 transition text-center"
              >
                <div className="text-2xl font-bold">Stoves / Fireplaces</div>
                <div className="text-sm text-slate-400 mt-1">
                  Dealer #CA419 &middot; LTL &middot; ships to showroom
                </div>
              </button>
              <button
                onClick={() => router.push('/travis/parts')}
                className="p-6 rounded-lg border-2 border-card-border bg-card text-slate-300 hover:border-slate-500 transition text-center"
              >
                <div className="text-2xl font-bold">Parts</div>
                <div className="text-sm text-slate-400 mt-1">
                  Weekly queue &middot; UPS Ground &middot; ships to Arnold
                </div>
              </button>
            </div>
          </section>
        )}
```

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/components/OrderHistory.tsx
git commit -m "Add Travis Industries section to home page + order history labels"
```

---

## Task 12: Final verification

**Files:** none

- [ ] **Step 1: Run the full test suite**

Run:
```bash
npm test
```

Expected: all tests pass (existing Plan 1 tests + new Plan 2 tests from tasks 2, 3, 4).

- [ ] **Step 2: Typecheck the whole project**

Run:
```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Lint**

Run:
```bash
npm run lint
```

Expected: no new errors. Pre-existing warnings from Plan 1 may remain.

- [ ] **Step 4: Dev server smoke test**

```bash
npm run dev
```

In a browser (or via `mcp__Claude_Preview__*` tools), log in as `jeremy` / `hibernation2026` and verify the following:
1. Home page shows the new "Travis Industries" section with Stoves and Parts cards.
2. Click "Stoves / Fireplaces" → `/travis/stoves` loads with the vendor badge, dealer info (PO # shows after last-name filled), SKU autocomplete input, and disabled Submit button.
3. Type a known SKU (e.g., `98500277`) — dropdown shows match, Enter adds it as a line item with qty 1.
4. Try an unknown SKU (e.g., `ZZZ999`) — inline "Add as new part" form appears; filling it and clicking "Add & insert" inserts it as a line item.
5. Change a qty with +/− buttons; line total updates; remove button works.
6. Fill in a customer last name, pick a PO suffix mode, and confirm the PO # preview updates.
7. Do **NOT** actually click Submit (it would send a real email). Instead, verify the Submit button enables only when: ≥ 1 line item, PO suffix present, shipping address non-empty.

Stop the dev server when done (`Ctrl+C`).

- [ ] **Step 5: Verify clean commit history**

Run:
```bash
git log --oneline main..HEAD
```

Expected: one commit per task (Tasks 1–11 produced commits; Task 12 produces none).

- [ ] **Step 6: Verify working tree is clean**

Run:
```bash
git status
```

Expected: `working tree clean`, branch ahead of `origin/main` by the Plan 2 commit count.

---

## Post-plan

After Task 12 passes, the branch is ready to fast-forward merge to `main` and push. Plan 3 picks up from there and adds the Parts queue + scheduler.
