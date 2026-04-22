# Travis Parts Queue + Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Travis **Parts** weekly-queue flow. Users add SKUs throughout the week to a persistent queue stored in Vercel KV. A Thursday 1pm PT cron auto-submits the queue as a single PO to `saleswest@travisindustries.com`; a Thursday noon PT reminder email gives Jeremy a one-hour window to edit or cancel. A weekly GitHub Actions workflow syncs unknown-SKU manual parts from KV into `src/data/travis/parts-manual.ts` and clears KV.

**Architecture:** Reuses everything Plan 2 built — `TravisSkuAutocomplete`, `TravisOrderData`, `generateTravisPdf`, `travis-manual-parts` helpers. A new `travis-queue` lib abstracts KV reads/writes behind the same `hasKV()` + in-memory fallback pattern used elsewhere. Submit logic (email + PDF + history) is extracted from Plan 2's `send-stoves-order` route into a shared `travis-submit` helper so the three submit paths (stoves form, parts Submit-now, parts cron) don't duplicate. Vercel cron hits two protected GET endpoints; GitHub Actions hits one protected token endpoint with GET (read) and DELETE (clear).

**Tech Stack:** TypeScript, Next.js 16 App Router (⚠ breaking-changes from prior versions — check `src/app/api/` handlers and `node_modules/next/dist/docs/` before writing new routes; `cookies()` is async), React 19, Tailwind CSS v4, Vitest, nodemailer, Vercel KV, Vercel Cron, GitHub Actions.

**Source doc:** [docs/superpowers/specs/2026-04-21-travis-industries-ordering-design.md](../specs/2026-04-21-travis-industries-ordering-design.md)

**Builds on:**
- [2026-04-21-travis-foundation-and-catalog.md](./2026-04-21-travis-foundation-and-catalog.md) (merged)
- [2026-04-22-travis-stoves-ui.md](./2026-04-22-travis-stoves-ui.md) (prereq — this plan relies on components/types it introduces)

---

## File Structure

**New files:**
- `src/lib/travis-queue.ts` — queue KV helpers (get/add/updateQty/remove/clear/setSuffix)
- `src/lib/__tests__/travis-queue.test.ts`
- `src/lib/travis-submit.ts` — shared submit pipeline (build email HTML, sendMail, save StoredOrder)
- `src/lib/__tests__/travis-submit.test.ts`
- `src/lib/travis-parts-order.ts` — `buildPartsOrderData(queue)` — pure function shared by Submit-now and cron
- `src/app/api/travis/parts-queue/route.ts` — GET / PATCH queue
- `src/app/api/travis/parts-submit-now/route.ts` — user-triggered submit (cookie auth)
- `src/app/api/travis/parts-submit/route.ts` — cron-triggered submit (CRON_SECRET)
- `src/app/api/travis/parts-reminder/route.ts` — cron-triggered reminder (CRON_SECRET)
- `src/app/api/travis/export-manual-parts/route.ts` — GH Actions sync target (GITHUB_SYNC_TOKEN)
- `src/components/TravisPartsQueueCard.tsx` — queue display + edit actions
- `src/app/travis/parts/page.tsx` — parts page (queue card + SKU autocomplete + submit bar)
- `vercel.json` — Vercel cron schedule (new file)
- `.github/workflows/sync-travis-manual-parts.yml`

**Modified files:**
- `src/app/api/travis/send-stoves-order/route.ts` — refactored to call `sendTravisOrder()` from the shared helper

**NOT touched in this plan** (already landed in Plan 2):
- `src/components/TravisSkuAutocomplete.tsx`
- `src/lib/travis-pdf.ts`
- `src/lib/travis-manual-parts.ts`
- `src/types/travis-order.ts`
- `src/app/page.tsx` (Travis section; `/travis/parts` button is already wired)

---

## Task 1: Queue storage helpers

**Files:**
- Create: `src/lib/travis-queue.ts`
- Create: `src/lib/__tests__/travis-queue.test.ts`

KV key `travis-parts-queue` stores `TravisPartsQueue` (from `src/types/travis.ts`). This module hides the `hasKV()` fallback — same pattern as `src/lib/kv.ts` and `src/lib/travis-manual-parts.ts`. Adding the same SKU twice merges into a single line item with summed qty (price snapshot from the first add stays — the whole point of `priceAtAdd`).

- [ ] **Step 1: Write failing tests first**

Write `src/lib/__tests__/travis-queue.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to confirm failure**

Run:
```bash
npm test -- src/lib/__tests__/travis-queue.test.ts
```

Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement the helper**

Write `src/lib/travis-queue.ts`:

```ts
/**
 * KV-backed Travis Parts queue.
 *
 * One growing order lives in KV under `travis-parts-queue`; Thursday 1pm PT the
 * cron auto-submits and clears. Mirrors the `hasKV()` + in-memory fallback
 * pattern from `src/lib/kv.ts` and `src/lib/travis-manual-parts.ts` so local dev
 * without KV creds still works end-to-end.
 */
import type {
  TravisPartsQueue,
  TravisQueueLineItem,
} from '@/types/travis';

const KEY = 'travis-parts-queue';

// In-memory fallback for local dev without KV credentials.
let memFallback: TravisPartsQueue = emptyQueue();

function emptyQueue(): TravisPartsQueue {
  return { lineItems: [], lastUpdated: new Date().toISOString() };
}

function hasKV(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getKV() {
  const { kv } = await import('@vercel/kv');
  return kv;
}

async function readQueue(): Promise<TravisPartsQueue> {
  if (hasKV()) {
    const kv = await getKV();
    const stored = await kv.get<TravisPartsQueue>(KEY);
    return stored ?? emptyQueue();
  }
  return memFallback;
}

async function writeQueue(queue: TravisPartsQueue): Promise<void> {
  const withStamp: TravisPartsQueue = { ...queue, lastUpdated: new Date().toISOString() };
  if (hasKV()) {
    const kv = await getKV();
    await kv.set(KEY, withStamp);
  } else {
    memFallback = withStamp;
  }
}

export async function getQueue(): Promise<TravisPartsQueue> {
  return readQueue();
}

export interface AddToQueueInput {
  sku: string;
  name: string;
  price: number;
}

/**
 * Append a SKU to the queue, or merge into an existing line if the SKU is
 * already present. The original `priceAtAdd` / `nameAtAdd` snapshots are kept
 * on merge — mid-queue catalog price changes must not alter already-queued
 * lines.
 */
export async function addToQueue(input: AddToQueueInput, qty: number): Promise<void> {
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error(`qty must be a positive number (got ${qty})`);
  }
  const sku = input.sku.trim().toUpperCase();
  const queue = await readQueue();
  const existing = queue.lineItems.find(li => li.sku === sku);
  let nextItems: TravisQueueLineItem[];
  if (existing) {
    nextItems = queue.lineItems.map(li =>
      li.sku === sku ? { ...li, qty: li.qty + qty } : li
    );
  } else {
    const newLine: TravisQueueLineItem = {
      sku,
      qty,
      priceAtAdd: input.price,
      nameAtAdd: input.name.trim(),
      addedAt: new Date().toISOString(),
    };
    nextItems = [...queue.lineItems, newLine];
  }
  await writeQueue({ ...queue, lineItems: nextItems });
}

/** Set a specific line's qty. If qty <= 0, remove the line. No-op for unknown SKU. */
export async function setLineItemQty(sku: string, qty: number): Promise<void> {
  const normalized = sku.trim().toUpperCase();
  const queue = await readQueue();
  if (!queue.lineItems.some(li => li.sku === normalized)) return;
  const nextItems = qty <= 0
    ? queue.lineItems.filter(li => li.sku !== normalized)
    : queue.lineItems.map(li => li.sku === normalized ? { ...li, qty } : li);
  await writeQueue({ ...queue, lineItems: nextItems });
}

export async function removeLineItem(sku: string): Promise<void> {
  const normalized = sku.trim().toUpperCase();
  const queue = await readQueue();
  const nextItems = queue.lineItems.filter(li => li.sku !== normalized);
  await writeQueue({ ...queue, lineItems: nextItems });
}

/** Empty the queue and drop any suffix override. */
export async function clearQueue(): Promise<void> {
  await writeQueue(emptyQueue());
}

/** Set or clear the PO suffix override. Pass `undefined` or `''` to clear. */
export async function setSuffixOverride(suffix: string | undefined): Promise<void> {
  const queue = await readQueue();
  const trimmed = suffix?.trim();
  const next: TravisPartsQueue = {
    ...queue,
    suffixOverride: trimmed && trimmed.length > 0 ? trimmed : undefined,
  };
  await writeQueue(next);
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run:
```bash
npm test -- src/lib/__tests__/travis-queue.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/travis-queue.ts src/lib/__tests__/travis-queue.test.ts
git commit -m "Add travis-queue KV helpers with tests"
```

---

## Task 2: Parts-queue CRUD API

**Files:**
- Create: `src/app/api/travis/parts-queue/route.ts`

One endpoint, two methods: `GET` returns the current queue; `PATCH` takes a small action tag (`add` / `updateQty` / `remove` / `clear` / `setSuffix`) and mutates the queue. Keeping it as one endpoint avoids proliferating routes.

⚠ **Next.js 16 note:** before writing, skim an existing route handler (`src/app/api/orders/route.ts` or the Plan 2 `travis/catalog/route.ts`) to confirm current `GET` / `PATCH` signatures.

- [ ] **Step 1: Implement the route handler**

Write `src/app/api/travis/parts-queue/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  getQueue,
  addToQueue,
  setLineItemQty,
  removeLineItem,
  clearQueue,
  setSuffixOverride,
} from '@/lib/travis-queue';

export async function GET() {
  try {
    const queue = await getQueue();
    return NextResponse.json({ queue });
  } catch (err) {
    console.error('parts-queue GET failed:', err);
    return NextResponse.json({ error: 'Failed to read queue' }, { status: 500 });
  }
}

interface PatchPayload {
  action?: unknown;
  sku?: unknown;
  name?: unknown;
  price?: unknown;
  qty?: unknown;
  suffix?: unknown;
}

export async function PATCH(request: NextRequest) {
  try {
    const body: PatchPayload = await request.json();
    const action = typeof body.action === 'string' ? body.action : '';

    switch (action) {
      case 'add': {
        const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const price = typeof body.price === 'number' && isFinite(body.price) ? body.price : NaN;
        const qty = typeof body.qty === 'number' && isFinite(body.qty) ? body.qty : 1;
        if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 });
        if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
        if (!isFinite(price) || price < 0) {
          return NextResponse.json({ error: 'price must be a non-negative number' }, { status: 400 });
        }
        if (!isFinite(qty) || qty <= 0) {
          return NextResponse.json({ error: 'qty must be a positive number' }, { status: 400 });
        }
        await addToQueue({ sku, name, price }, qty);
        break;
      }
      case 'updateQty': {
        const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
        const qty = typeof body.qty === 'number' && isFinite(body.qty) ? body.qty : NaN;
        if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 });
        if (!isFinite(qty)) return NextResponse.json({ error: 'qty is required' }, { status: 400 });
        await setLineItemQty(sku, qty);
        break;
      }
      case 'remove': {
        const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
        if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 });
        await removeLineItem(sku);
        break;
      }
      case 'clear': {
        await clearQueue();
        break;
      }
      case 'setSuffix': {
        const suffix = typeof body.suffix === 'string' ? body.suffix : undefined;
        await setSuffixOverride(suffix);
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const queue = await getQueue();
    return NextResponse.json({ queue });
  } catch (err) {
    console.error('parts-queue PATCH failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to update queue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```

Expected: no errors, no new warnings.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/travis/parts-queue/route.ts
git commit -m "Add parts-queue GET/PATCH endpoint"
```

---

## Task 3: Shared submit pipeline (extract from stoves route)

**Files:**
- Create: `src/lib/travis-submit.ts`
- Create: `src/lib/__tests__/travis-submit.test.ts`
- Modify: `src/app/api/travis/send-stoves-order/route.ts` (replace body with helper call)

We're about to add three submit paths (stoves form, parts Submit-now, parts cron). Extract the email + PDF + history-save pipeline once, use it everywhere.

- [ ] **Step 1: Write failing tests for the helper**

Write `src/lib/__tests__/travis-submit.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to confirm fail**

Run:
```bash
npm test -- src/lib/__tests__/travis-submit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Write `src/lib/travis-submit.ts`:

```ts
/**
 * Shared submit pipeline used by every Travis order path:
 *   - POST /api/travis/send-stoves-order
 *   - POST /api/travis/parts-submit-now
 *   - GET  /api/travis/parts-submit   (cron)
 *
 * Responsibilities: generate PDF, send email (To: saleswest@, CC: info+jeremy,
 * From: GMAIL_USER), save StoredOrder to history. Returns the orderId for the
 * caller to surface.
 */
import nodemailer from 'nodemailer';
import { generateTravisPdf } from './travis-pdf';
import { saveOrder } from './kv';
import type { StoredOrder } from '@/types/order-history';
import type { TravisOrderData } from '@/types/travis-order';

export type TravisVendor = 'travis-stoves' | 'travis-parts';

export interface SubmitOptions {
  vendor: TravisVendor;
}

export interface SubmitResult {
  orderId: string;
}

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function flowLabel(flow: TravisOrderData['flow']): string {
  return flow === 'stoves' ? 'Stoves / Fireplaces' : 'Parts';
}

function flowShortLabel(flow: TravisOrderData['flow']): string {
  return flow === 'stoves' ? 'Stoves' : 'Parts';
}

export function buildTravisOrderEmailHtml(data: TravisOrderData): string {
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
      <h2 style="color:#1565a6;margin-bottom:4px">Travis Industries — ${flowLabel(data.flow)} Order</h2>
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

/**
 * Send a Travis order: PDF attached, To saleswest@, CC info+jeremy, and save
 * the StoredOrder history row. Throws on send failure — caller is expected to
 * surface or catch.
 */
export async function sendTravisOrder(
  data: TravisOrderData,
  options: SubmitOptions
): Promise<SubmitResult> {
  if (!data.lineItems || data.lineItems.length === 0) {
    throw new Error('No line items');
  }
  if (!data.dealerInfo?.poNumber) {
    throw new Error('PO number required');
  }

  const pdfBytes = generateTravisPdf(data);
  const filename = `Hibernation_PO_${data.dealerInfo.poNumber}_Travis_${flowShortLabel(data.flow)}.pdf`;

  await transporter.sendMail({
    from: `"Hibernation Orders" <${process.env.GMAIL_USER}>`,
    to: 'saleswest@travisindustries.com',
    cc: ['info@hibernation.com', 'jeremy@hibernation.com'],
    subject: `New Order - Hibernation PO# ${data.dealerInfo.poNumber} - Travis ${flowShortLabel(data.flow)}`,
    html: buildTravisOrderEmailHtml(data),
    attachments: [
      { filename, content: Buffer.from(pdfBytes), contentType: 'application/pdf' },
    ],
  });

  const orderId = crypto.randomUUID();
  const itemCount = data.lineItems.reduce((sum, i) => sum + i.qty, 0);
  const storedOrder: StoredOrder = {
    id: orderId,
    type: 'stove',
    vendor: options.vendor,
    status: 'submitted',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    poNumber: data.dealerInfo.poNumber,
    orderDate: data.dealerInfo.orderDate,
    orderedBy: data.dealerInfo.orderedBy,
    description: `Travis ${flowShortLabel(data.flow)} — ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
    total: data.total,
    freight: data.freight,
    orderData: data as unknown as Record<string, unknown>,
  };
  try {
    await saveOrder(storedOrder);
  } catch (kvError) {
    // Email already sent; history-save failure is non-fatal.
    console.error(`Failed to save Travis ${options.vendor} order to KV (email sent):`, kvError);
  }

  return { orderId };
}
```

- [ ] **Step 4: Verify tests pass**

Run:
```bash
npm test -- src/lib/__tests__/travis-submit.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Refactor the stoves route to use the helper**

Replace the contents of `src/app/api/travis/send-stoves-order/route.ts` (overwrite the Plan 2 inline implementation):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { sendTravisOrder } from '@/lib/travis-submit';
import type { TravisOrderData } from '@/types/travis-order';

export async function POST(request: NextRequest) {
  try {
    const data: TravisOrderData = await request.json();
    const { orderId } = await sendTravisOrder(data, { vendor: 'travis-stoves' });
    return NextResponse.json({ success: true, orderId });
  } catch (err) {
    console.error('Send Travis stoves order error:', err);
    const message = err instanceof Error ? err.message : 'Failed to send order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 6: Typecheck + full test run**

Run:
```bash
npx tsc --noEmit && npm test
```

Expected: no type errors, all tests pass (including the Plan 2 suite).

- [ ] **Step 7: Commit**

```bash
git add src/lib/travis-submit.ts src/lib/__tests__/travis-submit.test.ts src/app/api/travis/send-stoves-order/route.ts
git commit -m "Extract sendTravisOrder shared helper; refactor stoves route"
```

---

## Task 4: `TravisPartsQueueCard` component

**Files:**
- Create: `src/components/TravisPartsQueueCard.tsx`

The persistent queue panel shown at the top of `/travis/parts`. Displays current lineItems, lets the user edit qty / remove / clear, set a PO suffix override, and trigger Submit-now. Calls `/api/travis/parts-queue` (PATCH) and `/api/travis/parts-submit-now` (POST).

- [ ] **Step 1: Create the component**

Write `src/components/TravisPartsQueueCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { TravisPartsQueue } from '@/types/travis';

interface Props {
  queue: TravisPartsQueue;
  onQueueChange: (queue: TravisPartsQueue) => void;
  onSubmitted: (orderId: string) => void;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function TravisPartsQueueCard({ queue, onQueueChange, onSubmitted }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const subtotal = queue.lineItems.reduce((sum, li) => sum + li.priceAtAdd * li.qty, 0);
  const itemCount = queue.lineItems.reduce((sum, li) => sum + li.qty, 0);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/travis/parts-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      const data: { queue: TravisPartsQueue } = await res.json();
      onQueueChange(data.queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Queue update failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleQtyChange(sku: string, qty: number) {
    if (qty < 0) return;
    await patch({ action: 'updateQty', sku, qty });
  }

  async function handleRemove(sku: string) {
    await patch({ action: 'remove', sku });
  }

  async function handleClear() {
    if (!confirm('Clear the entire Travis parts queue? This cannot be undone.')) return;
    await patch({ action: 'clear' });
  }

  async function handleSuffixChange(suffix: string) {
    await patch({ action: 'setSuffix', suffix });
  }

  async function handleSubmitNow() {
    if (queue.lineItems.length === 0) return;
    if (!confirm(`Submit ${itemCount} item${itemCount !== 1 ? 's' : ''} to Travis now? This overrides the Thursday schedule.`)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/travis/parts-submit-now', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      onSubmitted(payload.orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-card rounded-lg border border-card-border p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Pending Parts Order</h2>
          <p className="text-sm text-slate-400">
            Submits automatically Thursday 1pm PT · {itemCount} item{itemCount !== 1 ? 's' : ''} · {formatCurrency(subtotal)} subtotal
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSubmitNow}
            disabled={submitting || busy || queue.lineItems.length === 0}
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              !submitting && !busy && queue.lineItems.length > 0
                ? 'bg-brand text-white hover:bg-brand-light'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            {submitting ? 'Submitting…' : 'Submit now'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={busy || submitting || queue.lineItems.length === 0}
            className="px-3 py-2 rounded text-sm text-slate-400 hover:text-white border border-card-border hover:border-slate-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm text-slate-400">
          PO suffix <span className="text-xs text-slate-500">(defaults to <span className="font-mono">Stock</span> at submit)</span>
        </label>
        <input
          type="text"
          value={queue.suffixOverride ?? ''}
          onChange={e => handleSuffixChange(e.target.value)}
          placeholder="Stock"
          className="w-48 bg-input-bg border border-input-border rounded px-3 py-1.5 text-sm text-white font-mono focus:border-brand focus:outline-none"
        />
      </div>

      {queue.lineItems.length === 0 ? (
        <p className="text-center text-slate-500 text-sm py-6">
          Queue is empty. Add SKUs below — they accumulate until Thursday&apos;s submit.
        </p>
      ) : (
        <div className="border border-card-border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">SKU</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Description</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-400 w-28">Qty</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-400 w-24">Unit</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-400 w-24">Line</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {queue.lineItems.map(li => (
                <tr key={li.sku} className="border-t border-card-border">
                  <td className="px-3 py-2 font-mono text-xs text-brand-light whitespace-nowrap">{li.sku}</td>
                  <td className="px-3 py-2 text-slate-300 truncate max-w-xs">{li.nameAtAdd}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQtyChange(li.sku, li.qty - 1)}
                        disabled={busy}
                        className="w-6 h-6 rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-40 transition text-sm"
                        aria-label="Decrease qty"
                      >
                        −
                      </button>
                      <span className="font-mono text-white w-8 text-center">{li.qty}</span>
                      <button
                        type="button"
                        onClick={() => handleQtyChange(li.sku, li.qty + 1)}
                        disabled={busy}
                        className="w-6 h-6 rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-40 transition text-sm"
                        aria-label="Increase qty"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400">{formatCurrency(li.priceAtAdd)}</td>
                  <td className="px-3 py-2 text-right font-mono text-white">{formatCurrency(li.priceAtAdd * li.qty)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleRemove(li.sku)}
                      disabled={busy}
                      className="text-slate-500 hover:text-red-400 disabled:opacity-40 transition"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-800/40">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-sm text-slate-400">Subtotal</td>
                <td className="px-3 py-2 text-right font-mono text-white">{formatCurrency(subtotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
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

Expected: no errors; existing unrelated lint warnings may remain.

- [ ] **Step 3: Commit**

```bash
git add src/components/TravisPartsQueueCard.tsx
git commit -m "Add TravisPartsQueueCard (queue display + edit + submit-now)"
```

---

## Task 5: `/travis/parts` page

**Files:**
- Create: `src/app/travis/parts/page.tsx`

Client component. Fetches the queue on mount, renders the `TravisPartsQueueCard` + the shared `TravisSkuAutocomplete`. Adding a SKU via autocomplete POSTs an `add` action to `/api/travis/parts-queue`.

- [ ] **Step 1: Write the page**

Write `src/app/travis/parts/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TravisSkuAutocomplete from '@/components/TravisSkuAutocomplete';
import TravisPartsQueueCard from '@/components/TravisPartsQueueCard';
import type { TravisPartsQueue, TravisProduct } from '@/types/travis';

export default function TravisPartsPage() {
  const router = useRouter();
  const [queue, setQueue] = useState<TravisPartsQueue>({ lineItems: [], lastUpdated: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justSubmittedId, setJustSubmittedId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/travis/parts-queue');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { queue: TravisPartsQueue } = await res.json();
        setQueue(data.queue);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load queue');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleAdd(product: TravisProduct, qty: number) {
    setAddError(null);
    try {
      const res = await fetch('/api/travis/parts-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          sku: product.sku,
          name: product.name,
          price: product.price,
          qty,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      const data: { queue: TravisPartsQueue } = await res.json();
      setQueue(data.queue);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Add failed');
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-start justify-between">
          <div>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-sm text-slate-400 hover:text-white transition mb-1"
            >
              ← Home
            </button>
            <h1 className="text-2xl font-bold text-white">Travis Parts</h1>
            <p className="text-sm text-slate-400">
              Items accumulate in the queue; Thursday 1pm PT the full order ships as one PO to Travis.
            </p>
          </div>
        </header>

        {justSubmittedId && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-green-300">
            <p className="font-medium">Order submitted.</p>
            <p className="text-sm text-green-400/80">Order ID {justSubmittedId} — confirmation email on the way.</p>
          </div>
        )}

        {loading ? (
          <div className="bg-card rounded-lg border border-card-border p-8 text-center text-slate-400">
            Loading queue…
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300">
            {error}
          </div>
        ) : (
          <TravisPartsQueueCard
            queue={queue}
            onQueueChange={setQueue}
            onSubmitted={id => {
              setJustSubmittedId(id);
              setQueue({ lineItems: [], lastUpdated: new Date().toISOString() });
            }}
          />
        )}

        <div className="bg-card rounded-lg border border-card-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">Add to queue</h3>
          <TravisSkuAutocomplete onAdd={handleAdd} placeholder="Enter Travis parts SKU…" />
          {addError && (
            <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded px-3 py-2">
              {addError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Smoke test in dev**

Run:
```bash
npm run dev
```

In another terminal, visit `http://localhost:3000/travis/parts`. Expected:
- No 404.
- Empty-queue card renders with "Queue is empty" message.
- SKU input is present below.

Kill the dev server (`Ctrl+C`).

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/travis/parts/page.tsx
git commit -m "Add /travis/parts page"
```

---

## Task 6: `buildPartsOrderData` helper + `/api/travis/parts-submit-now` endpoint

**Files:**
- Create: `src/lib/travis-parts-order.ts`
- Create: `src/lib/__tests__/travis-parts-order.test.ts`
- Create: `src/app/api/travis/parts-submit-now/route.ts`

User-triggered submit from the queue card (Submit-now button). Cookie-authed through middleware (no special auth check needed beyond the existing middleware redirect). Reads queue → builds `TravisOrderData` → `sendTravisOrder({vendor:'travis-parts'})` → clears queue on success.

The `buildPartsOrderData(queue)` function lives in its own lib file because the Thursday cron (Task 7) also needs it. Keeping it out of `route.ts` avoids the anti-pattern of importing across route modules and keeps it pure-testable.

- [ ] **Step 1: Write failing tests for `buildPartsOrderData`**

Write `src/lib/__tests__/travis-parts-order.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to confirm fail**

Run:
```bash
npm test -- src/lib/__tests__/travis-parts-order.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Write `src/lib/travis-parts-order.ts`:

```ts
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
```

- [ ] **Step 4: Verify tests pass**

Run:
```bash
npm test -- src/lib/__tests__/travis-parts-order.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Write the route handler**

Write `src/app/api/travis/parts-submit-now/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getQueue, clearQueue } from '@/lib/travis-queue';
import { sendTravisOrder } from '@/lib/travis-submit';
import { buildPartsOrderData } from '@/lib/travis-parts-order';

export async function POST() {
  try {
    const queue = await getQueue();
    if (queue.lineItems.length === 0) {
      return NextResponse.json({ error: 'Queue is empty' }, { status: 400 });
    }

    const data = buildPartsOrderData(queue);
    const { orderId } = await sendTravisOrder(data, { vendor: 'travis-parts' });

    // Only clear after a successful send.
    await clearQueue();

    return NextResponse.json({ success: true, orderId });
  } catch (err) {
    console.error('parts-submit-now failed:', err);
    const message = err instanceof Error ? err.message : 'Submit failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 6: Typecheck + lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/travis-parts-order.ts src/lib/__tests__/travis-parts-order.test.ts src/app/api/travis/parts-submit-now/route.ts
git commit -m "Add buildPartsOrderData helper + parts-submit-now endpoint"
```

---

## Task 7: `/api/travis/parts-submit` cron endpoint

**Files:**
- Create: `src/app/api/travis/parts-submit/route.ts`

GET. Runs Thursday 20:00 UTC (≈ 1pm PT during PDT). Authenticated via `Authorization: Bearer $CRON_SECRET` — Vercel Cron sends this header automatically. Reads queue, submits, clears, emails Jeremy a confirmation. On failure: alert Jeremy, do NOT clear the queue.

- [ ] **Step 1: Write the handler**

Write `src/app/api/travis/parts-submit/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getQueue, clearQueue } from '@/lib/travis-queue';
import { sendTravisOrder } from '@/lib/travis-submit';
import { buildPartsOrderData } from '@/lib/travis-parts-order';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function checkCronAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed — never allow a cron route if no secret is configured.
    return false;
  }
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

async function alertJeremy(subject: string, body: string) {
  try {
    await transporter.sendMail({
      from: `"Hibernation Orders" <${process.env.GMAIL_USER}>`,
      to: 'jeremy@hibernation.com',
      cc: 'info@hibernation.com',
      subject,
      text: body,
    });
  } catch (err) {
    console.error('alertJeremy failed:', err);
  }
}

export async function GET(request: NextRequest) {
  if (!checkCronAuth(request)) return unauthorized();

  try {
    const queue = await getQueue();
    if (queue.lineItems.length === 0) {
      // Nothing to send — no alert needed.
      return NextResponse.json({ success: true, submitted: false, reason: 'queue empty' });
    }

    const data = buildPartsOrderData(queue);

    try {
      const { orderId } = await sendTravisOrder(data, { vendor: 'travis-parts' });
      await clearQueue();

      const itemCount = data.lineItems.reduce((sum, li) => sum + li.qty, 0);
      await alertJeremy(
        `Travis parts auto-submitted — PO ${data.dealerInfo.poNumber}`,
        `The weekly Travis parts order submitted successfully.\n\n` +
          `PO: ${data.dealerInfo.poNumber}\n` +
          `Items: ${itemCount}\n` +
          `Total: $${data.total.toFixed(2)}\n` +
          `Order ID: ${orderId}\n`
      );

      return NextResponse.json({ success: true, submitted: true, orderId });
    } catch (sendErr) {
      // Keep the queue intact so Jeremy can retry via the UI.
      console.error('parts-submit send failed (queue kept):', sendErr);
      const message = sendErr instanceof Error ? sendErr.message : String(sendErr);
      await alertJeremy(
        'Travis parts auto-submit FAILED — action required',
        `The Thursday Travis parts submit failed.\n\n` +
          `Error: ${message}\n\n` +
          `The queue was NOT cleared. Open /travis/parts and click "Submit now" once the issue is resolved.`
      );
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (err) {
    console.error('parts-submit unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
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
git add src/app/api/travis/parts-submit/route.ts
git commit -m "Add GET /api/travis/parts-submit (cron auto-submit)"
```

---

## Task 8: `/api/travis/parts-reminder` cron endpoint

**Files:**
- Create: `src/app/api/travis/parts-reminder/route.ts`

GET. Runs Thursday 19:00 UTC (≈ noon PT during PDT — one hour before submit). Same cron auth as parts-submit. No-op if queue empty; otherwise emails a line-item summary to Jeremy with a link to `/travis/parts`.

- [ ] **Step 1: Write the handler**

Write `src/app/api/travis/parts-reminder/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getQueue } from '@/lib/travis-queue';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function checkCronAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function buildReminderHtml(
  lineItems: Array<{ sku: string; qty: number; priceAtAdd: number; nameAtAdd: string }>,
  subtotal: number,
  appUrl: string
): string {
  const rows = lineItems.map(li => `
    <tr>
      <td style="padding:4px 8px;border:1px solid #ddd;font-family:monospace;font-size:12px">${li.sku}</td>
      <td style="padding:4px 8px;border:1px solid #ddd">${li.nameAtAdd}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:center">${li.qty}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:right">${formatCurrency(li.priceAtAdd * li.qty)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#333">
      <h2 style="color:#1565a6;margin-bottom:4px">Travis parts order submitting in ~1 hour</h2>
      <p style="color:#666;margin-top:0">Click <a href="${appUrl}/travis/parts">Travis Parts</a> to edit or cancel before the auto-submit fires.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:left">SKU</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:left">Description</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:center">Qty</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:right">Line</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#f5f5f5">
            <td colspan="3" style="padding:6px 8px;text-align:right;border:1px solid #ddd;font-weight:bold">Subtotal</td>
            <td style="padding:6px 8px;text-align:right;border:1px solid #ddd;font-weight:bold">${formatCurrency(subtotal)}</td>
          </tr>
        </tfoot>
      </table>

      <p style="color:#999;font-size:12px;margin-top:24px">Auto-reminder from Hibernation Stoves &amp; Spas Order System</p>
    </div>
  `;
}

export async function GET(request: NextRequest) {
  if (!checkCronAuth(request)) return unauthorized();

  try {
    const queue = await getQueue();
    if (queue.lineItems.length === 0) {
      return NextResponse.json({ success: true, sent: false, reason: 'queue empty' });
    }

    const subtotal = queue.lineItems.reduce((sum, li) => sum + li.priceAtAdd * li.qty, 0);
    const itemCount = queue.lineItems.reduce((sum, li) => sum + li.qty, 0);
    const appUrl = process.env.APP_URL ?? 'https://orders.hibernation.com';

    await transporter.sendMail({
      from: `"Hibernation Orders" <${process.env.GMAIL_USER}>`,
      to: 'jeremy@hibernation.com',
      cc: 'info@hibernation.com',
      subject: `Travis parts order submitting in 1 hour — ${itemCount} item${itemCount !== 1 ? 's' : ''}, ${formatCurrency(subtotal)}`,
      html: buildReminderHtml(queue.lineItems, subtotal, appUrl),
    });

    return NextResponse.json({ success: true, sent: true });
  } catch (err) {
    console.error('parts-reminder failed:', err);
    const message = err instanceof Error ? err.message : 'Reminder failed';
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
git add src/app/api/travis/parts-reminder/route.ts
git commit -m "Add GET /api/travis/parts-reminder (one-hour advance warning)"
```

---

## Task 9: Vercel cron config

**Files:**
- Create: `vercel.json`

Vercel reads `vercel.json` at the repo root. Two entries: reminder at 19:00 UTC Thursday, submit at 20:00 UTC Thursday. Both hit the cron routes from Tasks 7 and 8, which check the Bearer `CRON_SECRET` (set via Vercel env).

Also: middleware currently redirects unauthenticated requests to `/login`. Vercel Cron GET requests to these routes include `Authorization: Bearer $CRON_SECRET` but NOT the `spa-orders-auth` cookie. We must allow cron paths through the middleware so they can reach the route handlers.

- [ ] **Step 1: Create `vercel.json`**

Write `vercel.json` at repo root (`C:\Users\jerem\Projects\vendor-orders\vercel.json`):

```json
{
  "crons": [
    { "path": "/api/travis/parts-reminder", "schedule": "0 19 * * 4" },
    { "path": "/api/travis/parts-submit", "schedule": "0 20 * * 4" }
  ]
}
```

- [ ] **Step 2: Update middleware to allow cron paths**

Modify `src/middleware.ts` — extend the first bypass block:

Old (lines 9-12):
```ts
  // Allow auth API and login page
  if (pathname === '/login' || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }
```

New:
```ts
  // Allow auth API, login page, and cron endpoints (cron endpoints authenticate
  // via Bearer CRON_SECRET inside the handler).
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth') ||
    pathname === '/api/travis/parts-submit' ||
    pathname === '/api/travis/parts-reminder' ||
    pathname === '/api/travis/export-manual-parts'
  ) {
    return NextResponse.next();
  }
```

(The `export-manual-parts` path in Task 10 also needs to bypass cookie auth because it's hit by GitHub Actions with its own token. Listing it here now avoids a middleware edit in a later task.)

- [ ] **Step 3: Smoke test cron auth in dev**

Run:
```bash
npm run dev
```

In another terminal, test that the cron endpoints reject requests without the secret:

```bash
curl -i http://localhost:3000/api/travis/parts-submit
```
Expected: `401 Unauthorized` (no middleware redirect — the handler itself rejects).

Set a local CRON_SECRET temporarily:

```bash
CRON_SECRET=testsecret npm run dev
```

In another terminal:

```bash
curl -i -H "Authorization: Bearer testsecret" http://localhost:3000/api/travis/parts-submit
```

Expected: `200 OK` with `{"success":true,"submitted":false,"reason":"queue empty"}`.

Kill the dev server.

(If you can't easily set env vars inline on Windows, skip this step; the unit-level behavior is covered by inspection of the handler code.)

- [ ] **Step 4: Typecheck + lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add vercel.json src/middleware.ts
git commit -m "Add Vercel cron schedule + middleware bypass for cron/export routes"
```

---

## Task 10: `/api/travis/export-manual-parts` endpoint (GH Actions sync target)

**Files:**
- Create: `src/app/api/travis/export-manual-parts/route.ts`

Two methods:
- `GET` → returns `{ products: TravisProduct[] }` — the current KV pending list — for the GH Actions workflow to consume.
- `DELETE` → clears `travis-parts-manual-pending` in KV. Called by the workflow only after a successful git commit.

Both require `Authorization: Bearer $GITHUB_SYNC_TOKEN`. The middleware already bypasses this path (Task 9).

- [ ] **Step 1: Write the handler**

Write `src/app/api/travis/export-manual-parts/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getPendingManualParts } from '@/lib/travis-manual-parts';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function checkSyncAuth(request: NextRequest): boolean {
  const secret = process.env.GITHUB_SYNC_TOKEN;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!checkSyncAuth(request)) return unauthorized();

  try {
    const products = await getPendingManualParts();
    return NextResponse.json({ products });
  } catch (err) {
    console.error('export-manual-parts GET failed:', err);
    return NextResponse.json({ error: 'Failed to read pending parts' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!checkSyncAuth(request)) return unauthorized();

  try {
    const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
    if (hasKV) {
      const { kv } = await import('@vercel/kv');
      await kv.del('travis-parts-manual-pending');
    }
    // Local/no-KV mode: the in-memory store is per-process; nothing to do.
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('export-manual-parts DELETE failed:', err);
    return NextResponse.json({ error: 'Failed to clear pending parts' }, { status: 500 });
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
git add src/app/api/travis/export-manual-parts/route.ts
git commit -m "Add GET/DELETE /api/travis/export-manual-parts (GH Actions sync)"
```

---

## Task 11: GitHub Actions — weekly manual-parts sync

**Files:**
- Create: `.github/workflows/sync-travis-manual-parts.yml`

Runs Sunday 03:00 UTC (well clear of Thursday's submit). Steps:
1. Fetch pending JSON from `${{ vars.APP_URL }}/api/travis/export-manual-parts` with `GITHUB_SYNC_TOKEN`.
2. Regenerate `src/data/travis/parts-manual.ts` via an inline Node script.
3. Run `git diff --exit-code` — if no diff, exit cleanly.
4. Otherwise commit + push, then `DELETE` the KV pending list.

Secrets required on the repo (user must set these post-merge — not this plan's responsibility):
- `GITHUB_SYNC_TOKEN` — shared secret value identical to Vercel env var
- `APP_URL` — production app URL (e.g., `https://orders.hibernation.com`) set as a repo variable

- [ ] **Step 1: Ensure the directory exists**

Run:
```bash
ls .github/workflows 2>/dev/null || mkdir -p .github/workflows
```

- [ ] **Step 2: Write the workflow**

Write `.github/workflows/sync-travis-manual-parts.yml`:

```yaml
name: Sync Travis Manual Parts

on:
  schedule:
    # Sunday 03:00 UTC — well clear of Thursday send window.
    - cron: "0 3 * * 0"
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Fetch pending manual parts from prod
        id: fetch
        env:
          APP_URL: ${{ vars.APP_URL }}
          GITHUB_SYNC_TOKEN: ${{ secrets.GITHUB_SYNC_TOKEN }}
        run: |
          set -euo pipefail
          if [ -z "${APP_URL:-}" ] || [ -z "${GITHUB_SYNC_TOKEN:-}" ]; then
            echo "::error::APP_URL variable or GITHUB_SYNC_TOKEN secret is not configured."
            exit 1
          fi
          curl -fsSL \
            -H "Authorization: Bearer ${GITHUB_SYNC_TOKEN}" \
            "${APP_URL}/api/travis/export-manual-parts" > /tmp/pending.json
          echo "count=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("/tmp/pending.json","utf8")).products.length)')" >> "$GITHUB_OUTPUT"

      - name: Regenerate parts-manual.ts
        run: |
          node <<'EOF'
          const fs = require('fs');
          const { products } = JSON.parse(fs.readFileSync('/tmp/pending.json', 'utf8'));
          const header = `// Hand-maintained / GH-Actions-sync target for manually-added Travis parts.
          // See docs/superpowers/specs/2026-04-21-travis-industries-ordering-design.md
          // ("Manual-parts storage (hybrid KV + TS)").
          //
          // Entries added here via the weekly GitHub Actions sync workflow (Plan 3).
          // Safe to edit by hand if needed.

          import { TravisProduct } from '@/types/travis';

          export const travisPartsManual: TravisProduct[] = `;

          // Sort by SKU for stable diffs.
          const sorted = [...products].sort((a, b) => a.sku.localeCompare(b.sku));
          const body = JSON.stringify(sorted, null, 2);
          fs.writeFileSync('src/data/travis/parts-manual.ts', header + body + ';\n');
          EOF

      - name: Check for changes
        id: diff
        run: |
          if git diff --quiet -- src/data/travis/parts-manual.ts; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
          else
            echo "changed=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Commit and push
        if: steps.diff.outputs.changed == 'true'
        env:
          COUNT: ${{ steps.fetch.outputs.count }}
        run: |
          set -euo pipefail
          git config user.name "hibernation-sync-bot"
          git config user.email "info@hibernation.com"
          git add src/data/travis/parts-manual.ts
          git commit -m "chore: sync travis manual parts (${COUNT} pending)"
          git push

      - name: Clear KV pending list
        if: steps.diff.outputs.changed == 'true'
        env:
          APP_URL: ${{ vars.APP_URL }}
          GITHUB_SYNC_TOKEN: ${{ secrets.GITHUB_SYNC_TOKEN }}
        run: |
          set -euo pipefail
          curl -fsSL -X DELETE \
            -H "Authorization: Bearer ${GITHUB_SYNC_TOKEN}" \
            "${APP_URL}/api/travis/export-manual-parts"

      - name: No changes — exit clean
        if: steps.diff.outputs.changed == 'false'
        run: echo "No pending manual parts to sync."
```

- [ ] **Step 3: Validate YAML syntax**

Run:
```bash
npx --yes yaml-lint .github/workflows/sync-travis-manual-parts.yml || true
```

(If `yaml-lint` isn't available, skip — GitHub will validate on push.)

Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/sync-travis-manual-parts.yml
git commit -m "Add weekly GH Actions workflow: sync Travis manual parts from KV"
```

---

## Task 12: Final verification

**Files:** (no changes — verification only)

Confirm the full plan landed cleanly.

- [ ] **Step 1: Run the full test suite**

Run:
```bash
npm test
```

Expected: all tests pass — including every Plan 1, Plan 2, and Plan 3 test (`travis-manual-parts`, `travis-po`, `travis-pdf`, `travis-submit`, `travis-queue`).

- [ ] **Step 2: Typecheck + lint across the whole repo**

Run:
```bash
npx tsc --noEmit && npm run lint
```

Expected: no type errors. Unrelated pre-existing lint warnings are acceptable; no NEW warnings.

- [ ] **Step 3: Dev-server smoke test**

Run:
```bash
npm run dev
```

In a browser:
1. Visit `http://localhost:3000/` → login if prompted → home page shows the Travis Industries section with Stoves and Parts buttons.
2. Click **Parts** → `/travis/parts` loads; empty-queue card visible; SKU autocomplete below.
3. Type an invalid SKU (e.g., `FAKE123`), press Enter → unknown-SKU form appears. Save with name "Test Part" price 9.99. Expected: added to queue, queue shows 1 × $9.99.
4. Click the `+` button next to the line → qty goes to 2, subtotal $19.98.
5. Click the `×` (remove) button → queue empties.
6. Set PO suffix override to `Job99` → verify the card shows it.
7. Add a real SKU (try a stove SKU from `src/data/travis/stoves.ts` — e.g., pick one from the generated file), verify autocomplete matches.

Kill the dev server.

- [ ] **Step 4: Verify git log shows the full plan lineage**

Run:
```bash
git log --oneline -20
```

Expected: commits from all 12 tasks (queue helpers, queue API, shared submit, queue card, parts page, submit-now, parts-submit cron, parts-reminder cron, vercel cron config, export-manual-parts, GH Actions workflow). No uncommitted changes from the plan:

```bash
git status
```

Expected: `nothing to commit, working tree clean`.

- [ ] **Step 5: Final commit of any plan-doc updates (if needed)**

If the plan file itself needed editing during execution, commit it:

```bash
git add docs/superpowers/plans/2026-04-22-travis-parts-queue.md
git commit -m "Update Travis Parts plan doc with execution notes" || echo "No plan-doc changes"
```

---

## Post-plan deployment notes (not tasks — reference)

Before the first Thursday cron fires in production, the user must (one-time setup, outside this plan):
1. Set `CRON_SECRET` in the Vercel dashboard (Environment Variables → Production).
2. Set `GITHUB_SYNC_TOKEN` in both Vercel and GitHub repo secrets — same value.
3. Set `APP_URL` as a GitHub repo variable (e.g., `https://orders.hibernation.com`).
4. (Optional) Set `APP_URL` in Vercel too, so the reminder email deep-links correctly.
5. After merge, verify the Vercel cron schedule is visible in Vercel Dashboard → Settings → Cron Jobs.
