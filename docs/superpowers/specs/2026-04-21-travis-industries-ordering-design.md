# Travis Industries Ordering — Design

**Date:** 2026-04-21
**Author:** Jeremy + Claude
**Status:** Design (pending plan)

## Summary

Add a Travis Industries order flow to the internal ordering app. Travis is a third manufacturer (dealer # **CA419**) alongside Marquis (101099) and Sundance (1805). Two order surfaces:

1. **Travis Stoves / Fireplaces** — SKU-based immediate-submit, ships to the retail store, LTL.
2. **Travis Parts** — SKU-based **weekly queue** (Thu 1pm PT), ships to the Arnold warehouse, UPS Ground.

Travis has no public API (their ordering site is ASP.NET Web Forms). Submission is email-only — same pattern as existing spa/accessories flows — to `saleswest@travisindustries.com`.

The design also cleans up two loose ends: the Total Fireplace order email (currently a testing placeholder — `info@hibernation.com`) and the ship-to address on existing supply orders (currently hardcoded to Angels Camp in `AccessoryOrderForm.tsx:257`).

## Scope

**In scope:**
- New "Travis Industries" home-screen card with Stoves and Parts sub-flows
- SKU-based line-item entry with autocomplete from a local catalog
- Unknown-SKU fallback: inline "add new part" prompt (name + price)
- Parts queue with Vercel KV persistence
- Weekly auto-submit cron with one-hour advance email reminder
- Import script to seed the catalog from the 2026 Travis dealer-cost PDF (Tier 4 pricing)
- Dealer metadata: CA419
- Collateral fixes:
  - `totalFireplace.orderEmail` → `totalfireplace@yahoo.com`
  - Supply-order default ship-to → 2182 Hwy 4 #E540, Arnold, CA 95223, UPS Ground (applies to Marquis Accessories, Total Fireplace, Travis Parts)

**Out of scope (Phase 2+):**
- Scraping `travisdealer.com` Brand → Model → Parts drill-down for automatic parts-catalog population
- Automated order submission through `order.travisdealer.com` (ASP.NET Web Forms, session/ViewState handling)
- Pulling stock / out-of-stock flags from Travis's cart
- Automatic order-cancellation workflow (cancel by emailing Travis directly, as today)
- Generalizing the "weekly queue" pattern to other vendors (would reuse the same components if/when needed)

## User-Facing Behavior

### Home screen

Third card added next to SPAS and SUPPLIES & ACCESSORIES:

```
TRAVIS INDUSTRIES
  • Stoves / Fireplaces
  • Parts
```

### Travis Stoves / Fireplaces — immediate flow

Layout and interaction mirror the existing accessories flow, with these differences:

- **SKU entry field** (text input) with autocomplete from `travisStoves` catalog; up/down to highlight, Enter to add with qty 1.
- **Unknown SKU** → inline "Add new part" form (name + price). On save, written to `travis-parts-manual-pending` in KV and immediately added to the order.
- **Line-item list** shows SKU, name, qty, unit price, extended price, remove button.
- **PO suffix prompt** — radio: `LastName` / `Stock` / `Custom (freeform)`. Combined with the MMDDYY date prefix (e.g., `042226Stock`).
- **Shipping (editable)** — default:
  - Address: `2122 Highway 49 Suite D, Angels Camp, CA 95222`
  - Method: `LTL`
  - Order notes: `SHIP COMPLETE`
- **Dealer info:** CA419 + existing dealer name/contact/phone (same header pattern as Marquis).
- **Submit button** → generates PDF, emails to `saleswest@travisindustries.com`, stores in order history.

### Travis Parts — queue flow

The page is always anchored by a persistent **Pending Queue** card at the top:

```
┌─ Pending Parts Order (submits Thursday 1pm PT) ─────┐
│  3 items · $186.40 total                            │
│                                                      │
│  94500624  LOG SET, FPL 36 564 DLX BIRCH   2 × $236 │
│  250-01463 STEPPER MOTOR                    1 × $45  │
│  ...                                                 │
│                                                      │
│  [ Edit qty ]  [ Remove ]  [ Submit now ]  [ Clear ] │
└──────────────────────────────────────────────────────┘
```

Below the queue: the same SKU-entry + autocomplete + unknown-SKU-prompt component used by Stoves.

**Behavior:**
- Adding a line item from SKU entry appends to the queue (no per-order distinction — it's one growing order until submitted).
- Editing qty or removing items updates KV.
- **Submit now** overrides the schedule: immediate email send.
- **Clear** empties the queue (with a confirmation).
- Thursday 1pm PT: cron auto-submits.
- PO suffix defaults to `Stock`; user can set a different suffix inline on the queue card if desired.
- Shipping default: `2182 Hwy 4 #E540, Arnold, CA 95223, UPS Ground` — editable per submission.

### Email conventions (all order channels)

Every outbound order email — Travis Stoves, Travis Parts (scheduled or manual), and existing spa/accessories flows — uses the same recipient pattern:

- **To:** vendor order email (e.g., `saleswest@travisindustries.com`)
- **CC:** `info@hibernation.com` and `jeremy@hibernation.com`
- **From:** `GMAIL_USER` (currently `info@hibernation.com`)

This matches the existing implementation at `src/app/api/send-order/route.ts:78` and `src/app/api/send-accessories-order/route.ts:87`. New Travis submission handlers (`parts-submit`, `parts-submit-now`, and whatever sends stoves orders) must follow the same pattern. Factor into a shared helper if it reduces duplication during implementation.

Internal notification emails (reminder, submit-confirmation, failure alerts) are separate from order emails and don't need the vendor-CC pattern — they go To: `jeremy@hibernation.com`, CC: `info@hibernation.com`.

### Reminder email

Thursday noon PT:

- Subject: `Travis parts order submitting in 1 hour — N items, $XXX.XX`
- Body: line-item list, link to `/travis/parts` to edit or cancel
- Sent only if queue is non-empty

### Post-submit behavior

After auto-submit or manual "Submit now":
- Order moves to existing order history (same store used by spas/accessories)
- KV queue is cleared
- Confirmation email sent to `jeremy@hibernation.com`
- Order appears in the app's Order History list (existing component)

## Data Model

### Catalog files

```
src/data/travis/
  stoves.ts         # AUTO-GENERATED — stoves, fireplaces, inserts, their accessories
  parts.ts          # AUTO-GENERATED — parts and sub-items from the catalog
  parts-manual.ts   # Hand-maintained / sync-target for KV-sourced manual additions
  index.ts          # exports travisStoves, travisParts (merged parts + parts-manual + KV pending), lookup helpers
  dealer.ts         # CA419 + default dealer info (merges into src/data/dealer.ts if preferred)
```

### Type

```ts
// src/types/travis.ts
export type TravisProduct = {
  sku: string;           // primary key — what the user types
  name: string;
  price: number;         // Tier 4 dealer price (50% column from catalog)
  category?: string;     // optional grouping in UI (e.g., "Gas Fireplaces", "Log Sets")
  brand?: string;        // e.g., "Lopi", "Avalon", "Fireplace Xtrordinair", "DaVinci", "FPX"
  weightLbs?: number;    // optional — the PDF has it
  source: 'pricelist' | 'manual';
  lastUpdated: string;   // ISO date
};
```

Split into `travisStoves` and `travisParts` at import time based on whether the item is a "headline" product (stove/fireplace/insert) or a sub-item (log set, conversion kit, replacement part, accessory). When ambiguous, items default to `travisParts`. (See Catalog Import below.)

### Manual-parts storage (hybrid KV + TS)

**Read path (`src/data/travis/index.ts`):**

```ts
// At request time in an API route or server component:
const manualFromKV = await kv.get<TravisProduct[]>('travis-parts-manual-pending') ?? [];
const parts = mergeBySKU(travisParts, partsManual, manualFromKV); // KV wins ties
```

**Write path (when user adds an unknown SKU):**

```ts
// POST /api/travis/add-manual-part
// body: { sku, name, price }
const existing = (await kv.get<TravisProduct[]>('travis-parts-manual-pending')) ?? [];
const updated = dedupeBySKU([...existing, { sku, name, price, source: 'manual', lastUpdated: now }]);
await kv.set('travis-parts-manual-pending', updated);
```

**Sync path (weekly GitHub Actions):**

A scheduled workflow (`.github/workflows/sync-travis-manual-parts.yml`) runs weekly (e.g., Sunday 03:00 UTC — well clear of the Thursday-afternoon send window):

1. Hit an endpoint on prod that returns KV `travis-parts-manual-pending` as JSON (protected by a shared secret).
2. Regenerate `src/data/travis/parts-manual.ts` from the JSON.
3. If `git diff --exit-code` shows changes, commit and push: `chore: sync travis manual parts (N added)`.
4. Clear KV `travis-parts-manual-pending` after a successful commit.

**Resilience:** if KV is wiped, at most one week of unsynced manual additions are lost. Everything older lives in git forever.

### Parts queue storage

**KV key:** `travis-parts-queue`

```ts
export type TravisPartsQueue = {
  lineItems: Array<{
    sku: string;
    qty: number;
    priceAtAdd: number;     // snapshot — protects against mid-queue price updates
    addedAt: string;        // ISO
    nameAtAdd: string;      // snapshot for display stability
  }>;
  suffixOverride?: string;  // if user sets a non-default PO suffix before submit
  lastUpdated: string;      // ISO
};
```

### Order history record

Reuse the existing `StoredOrder` shape from `src/types/order-history.ts`. Add a `manufacturer: 'travis'` discriminant alongside existing `'marquis' | 'sundance'` (and however accessories are currently tagged — reconcile with existing code during plan).

## Catalog Import

### Source

`docs/travis-industries-catalogHouseofFireDealerCost.pdf` — 254 pages, ASCII-extractable via `pdfplumber`.

Each anchor page has:
- Headline product (1 SKU — the stove/fireplace itself) with a pricing row at columns: Level 1 (44%), Level 2 (46%), Level 3 (48%), **Level 4 (50%)**, 50+ Factory (51%), Sale Price, MSRP.
- Subsections (LP Conversion, Log Sets, Accessories) with their own SKUs + "Cost / Sale Price / MSRP" columns.

We want the **Level 4** column (`$2,145` for the 564 TRV 25K on page 3) for headline products, and the **Cost** column (`$180` for the Stepper 4-pack) for sub-items.

### Script

`scripts/import-travis.py` — follows the pattern of `scripts/import-marquis.py` (which the user already runs via `npm run import:marquis`).

Add `"import:travis": "python scripts/import-travis.py"` to `package.json`.

**Output:**
- `src/data/travis/stoves.ts` — headline products (stoves, fireplaces, inserts, freestanding stoves)
- `src/data/travis/parts.ts` — every non-headline SKU (log sets, conversion kits, accessories, replacement parts)

**Classification rule (first cut):**
- A SKU is a "stove" if its row is the one immediately under the product photo/heading at the top of the page.
- Every other SKU on the page is a "part".
- Edge cases: linear fireplaces, see-thrus, fire pits — treat as stoves. Outdoor complete fire pits, too.

**Robustness:**
- If the classifier gets an item wrong, Jeremy can move it by re-running import after adjusting a small override file (`scripts/import-travis-overrides.json` with `{ "sku": "stoves" | "parts" }`).
- The import should be idempotent and diffable — a re-run against the same PDF produces identical output.

**Brand detection:**
- The PDF's table of contents and section headers indicate brand (Lopi, Avalon, Fireplace Xtrordinair / FPX, DaVinci). Map pages to brands during parse.

## Scheduler

### Vercel Cron (`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/travis/parts-reminder", "schedule": "0 19 * * 4" },
    { "path": "/api/travis/parts-submit",   "schedule": "0 20 * * 4" }
  ]
}
```

- `19:00 UTC Thursday` — reminder (≈ noon PT during PDT, 11am PT during PST)
- `20:00 UTC Thursday` — submit (≈ 1pm PT during PDT, 12pm PT during PST)
- DST drift is accepted for v1. If PST timing becomes annoying, either (a) bump cron to `20:00 UTC / 21:00 UTC` and live with PDT drift instead, or (b) pick UTC slot once and have the handler check PT time before acting.

### Handlers

- `GET /api/travis/parts-reminder` — internal cron endpoint (requires `Authorization: Bearer $CRON_SECRET` per Vercel convention). Reads queue, sends reminder email if non-empty. No-op if empty.
- `GET /api/travis/parts-submit` — same auth. Reads queue, generates PDF, sends to `saleswest@travisindustries.com`, stores in order history, clears KV queue, confirms to Jeremy.
- `POST /api/travis/parts-submit-now` — user-triggered immediate submit (from the queue card). Same logic, no cron auth. Cookie-authed through existing middleware.

### Failure handling

- If the email send fails, **do not** clear the KV queue. Send an alert email to Jeremy with the error and instructions to retry via the UI.
- If KV read fails, log + bail + alert — don't send an empty order.
- If PDF generation fails, same as email failure.

### Env vars

Add to `.env.local` and Vercel:
- `TRAVIS_UN` / `TRAVIS_PW` — `order.travisdealer.com` creds (already present; reserved for Phase 2 automation)
- `TRAVISDEALER_UN` / `TRAVISDEALER_PW` — `travisdealer.com` parts-drill-down creds (reserved for Phase 2 scraping)
- `CRON_SECRET` — shared secret for cron endpoint auth
- `GITHUB_SYNC_TOKEN` — fine-grained PAT for the manual-parts sync workflow (repo-scoped, contents write)

## Collateral Fixes

### 1. Total Fireplace email

`src/data/accessories/total-fireplace.ts:10` — currently `orderEmail: 'info@hibernation.com'` with a `// testing — update when live` comment. Change to `'totalfireplace@yahoo.com'` and remove the comment.

### 2. Supply-order default ship-to

Currently, `src/components/AccessoryOrderForm.tsx:257` hardcodes the accessories ship-to as:

```
2122 Highway 49 Suite D, Angels Camp, CA (Appointment Required - 24 Hour Notice)
```

Change default ship-to for all supply/parts orders to:

```
2182 Highway 4 #E540
Arnold, CA 95223
```

Method: UPS Ground (default).

**Applies to (supply/parts orders):**
- Marquis Accessories
- Total Fireplace
- Travis Parts

**Unchanged (keep Angels Camp):**
- Marquis spa orders (`defaultMarquisDealer` in `src/data/dealer.ts`)
- Sundance spa orders (`defaultSundanceDealer` in `src/data/dealer.ts`)
- Travis Stoves / Fireplaces (NEW — uses Angels Camp)

Address remains editable per order. Implement by adding a centralized supply-order default (e.g., `DEFAULT_SUPPLY_SHIP_TO` in a new `src/data/shipping.ts`) referenced from `AccessoryOrderForm.tsx` and the new Travis Parts form. Do **not** change the spa-order defaults — those correctly deliver to the showroom.

### 3. Dealer info (Travis)

Add `defaultTravisDealer` to `src/data/dealer.ts` with:
- Dealer #: `CA419`
- Name / orderedBy / email / phone: existing Hibernation Stoves & Spas info (match the shape of `defaultMarquisDealer` / `defaultSundanceDealer`)
- Payment method: `EFT/Prepay` (matches Sundance; revisit if Travis uses a different term)
- `shippingAddress`: Angels Camp for the Stoves flow; the Parts flow overrides to Arnold via the supply-order default
- Also add `DEFAULT_TRAVIS_STOVES_FREIGHT` alongside existing `DEFAULT_MARQUIS_FREIGHT` / `DEFAULT_SUNDANCE_FREIGHT` — value TBD, confirm with Jeremy during plan or leave at `0` if Travis-quoted freight is always added per order

## File Structure — What Lands Where

**New files:**
```
src/app/travis/
  page.tsx                              # Travis landing (Stoves / Parts subnav)
  stoves/page.tsx                       # Travis Stoves order form
  parts/page.tsx                        # Travis Parts order form + queue card
src/app/api/travis/
  add-manual-part/route.ts              # POST — save unknown SKU to KV pending
  parts-queue/route.ts                  # GET / PATCH / DELETE — queue CRUD
  parts-submit-now/route.ts             # POST — user-triggered immediate submit
  parts-submit/route.ts                 # GET — cron-triggered submit
  parts-reminder/route.ts               # GET — cron-triggered reminder
  export-manual-parts/route.ts          # GET — used by GH Actions sync (secret-auth)
src/components/
  TravisOrderForm.tsx                   # shared between Stoves + Parts
  TravisSkuAutocomplete.tsx             # SKU input w/ autocomplete + unknown-SKU prompt
  TravisPartsQueueCard.tsx              # queue display + edit actions
src/data/travis/
  stoves.ts                             # AUTO-GENERATED
  parts.ts                              # AUTO-GENERATED
  parts-manual.ts                       # hand-maintained + sync-target
  index.ts                              # merging + lookup helpers
src/types/
  travis.ts                             # TravisProduct, TravisPartsQueue
src/lib/
  travis-pricing.ts                     # formatting, PO generation (reuses existing generatePO where possible)
  travis-pdf.ts                         # Travis-specific PDF (or extend existing src/lib/pdf.ts)
scripts/
  import-travis.py                      # PDF → stoves.ts + parts.ts
  import-travis-overrides.json          # (optional) classification overrides
.github/workflows/
  sync-travis-manual-parts.yml          # weekly KV → parts-manual.ts sync
vercel.json                             # new cron entries
```

**Modified files:**
```
package.json                            # + "import:travis"
src/app/page.tsx                        # add TRAVIS INDUSTRIES card
src/data/dealer.ts                      # + defaultTravisDealer + DEFAULT_TRAVIS_STOVES_FREIGHT
src/data/shipping.ts                    # NEW — DEFAULT_SUPPLY_SHIP_TO (Arnold + UPS Ground)
src/data/accessories/total-fireplace.ts # orderEmail → totalfireplace@yahoo.com
src/components/AccessoryOrderForm.tsx   # line 257 — use DEFAULT_SUPPLY_SHIP_TO instead of hardcoded Angels Camp
src/types/order-history.ts              # + 'travis' to manufacturer discriminant
vercel.json                             # + cron entries (if not already present; may be new file)
```

## Phase 2 (Future Work)

- **Scrape `travisdealer.com` parts drill-down** — crawl Brand → Model → Parts pages (authenticated via `TRAVISDEALER_UN/PW`), stage results into `parts-manual.ts` via a PR. Fills the "random parts Jeremy orders" gap without manual typing.
- **Automate submission to `order.travisdealer.com`** — headless browser (Playwright) that logs in, searches SKU, adds to cart, fills shipping, submits. ASP.NET Web Forms with ViewState — doable but fragile. Deferred until email-only pain justifies it.
- **Stock / OOS flags** — same scraping/automation context; lookup during SKU autocomplete and surface in the UI.
- **Cancel-last-order flow** — drafts a cancellation email to Travis for a selected recent order.
- **Generalize "weekly queue" to other vendors** — Marquis and Total Fireplace parts could opt into a queue if that becomes useful later.

## Risks & Open Questions

- **PDF import fidelity.** 254 pages of mixed table layouts. The Marquis import worked for accessories (much flatter). The Travis classifier may misfile some SKUs (stove vs part) — the override JSON is the escape hatch. Budget time for hand-correcting a small number of items after the first import run.
- **DST drift for cron.** Accepted, noted above. If Jeremy finds 11am PST sends annoying, swap UTC slots.
- **KV sync failure.** If GitHub Actions sync silently fails for weeks, manual parts pile up in KV. Alert on workflow failure (standard GH Actions notification).
- **Catalog updates.** When Travis releases a new price list (2027, mid-year update, etc.), re-run `npm run import:travis` — produces a diff of price changes and new/removed SKUs for review. Prices for already-queued items are locked via `priceAtAdd` so updates don't retroactively change a pending queue.
- **Identifying which catalog version was in effect when an order was placed.** Store a `catalogVersion` string on each order — e.g., the PDF filename / date. Low priority but cheap.
