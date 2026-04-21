# Travis Foundation & Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the foundation for Travis Industries ordering — types, dealer metadata, supply-shipping centralization, collateral fixes (Total Fireplace email), and a Travis catalog imported from the 2026 dealer-cost PDF at Tier 4 pricing. At the end of this plan, Travis stoves and parts are queryable via `src/data/travis/index.ts`, and the existing supply-order flows ship to the Arnold warehouse instead of Angels Camp.

**Architecture:** Extends the existing pattern of vendor-specific data files under `src/data/`. A Python import script converts the 254-page Travis PDF into two TypeScript files (`stoves.ts`, `parts.ts`), mirroring the pattern already used by `scripts/import-marquis.py` and `scripts/import-total-fireplace.py`. A new centralized supply ship-to default replaces the hardcoded Angels Camp address in `AccessoryOrderForm.tsx:257`. Vitest is introduced for pure-logic unit tests on the classifier and catalog-merge helpers.

**Tech Stack:** TypeScript, Next.js 16 (do not assume — see `node_modules/next/dist/docs/` for changes from prior versions), Python 3 + `pdfplumber`, Vitest (new), Vercel KV (installed but not used in this plan).

**Source doc:** [docs/superpowers/specs/2026-04-21-travis-industries-ordering-design.md](../specs/2026-04-21-travis-industries-ordering-design.md)

---

## File Structure

**New files:**
- `vitest.config.ts` — minimal vitest config
- `src/data/shipping.ts` — `DEFAULT_SUPPLY_SHIP_TO`
- `src/types/travis.ts` — `TravisProduct`, `TravisPartsQueue`, `TravisCategoryClass`
- `src/data/travis/index.ts` — exports travisStoves, travisParts (merged), lookup helpers
- `src/data/travis/parts-manual.ts` — hand-maintained / GH-Actions-sync target (starts empty)
- `src/data/travis/stoves.ts` — AUTO-GENERATED from `scripts/import-travis.py`
- `src/data/travis/parts.ts` — AUTO-GENERATED
- `src/data/travis/__tests__/index.test.ts` — tests for catalog merging + lookups
- `scripts/import-travis.py` — PDF → TS generator
- `scripts/import_travis/__init__.py` — package marker (allows unit tests)
- `scripts/import_travis/classify.py` — anchor-vs-sub classifier (own module for testing)
- `scripts/import_travis/parse.py` — page parsing helpers
- `scripts/tests/test_import_travis.py` — pytest tests for classifier and parser
- `scripts/import-travis-overrides.json` — starts as `{}`, populated as-needed for classification overrides

**Modified files:**
- `package.json` — add `import:travis`, `test` scripts; add `vitest` devDependency
- `src/data/dealer.ts` — add `defaultTravisDealer`, `DEFAULT_TRAVIS_STOVES_FREIGHT`
- `src/data/accessories/total-fireplace.ts:10` — fix orderEmail
- `src/components/AccessoryOrderForm.tsx:257` — use `DEFAULT_SUPPLY_SHIP_TO`
- `.gitignore` — add `.scrape/` if not present (already used by marquis import)

**NOT touched in this plan** (Plan 2 or 3):
- `src/app/page.tsx` (home-screen Travis card → Plan 2)
- Any Travis UI routes (`src/app/travis/*` → Plan 2)
- Any API routes (`src/app/api/travis/*` → Plan 2 & 3)
- Scheduler (`vercel.json`, cron endpoints → Plan 3)
- GitHub Actions sync workflow → Plan 3

---

## Task 1: Set up vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

This project has no test framework. We're adding vitest for pure-logic tests (catalog classifier, merging) without touching the Next.js runtime.

- [ ] **Step 1: Install vitest as a devDependency**

Run:
```bash
npm install -D vitest @vitest/ui
```

Expected: `package.json` updated with `vitest` under devDependencies; `package-lock.json` updated.

- [ ] **Step 2: Add `test` and `test:ui` scripts**

Edit `package.json`:

```diff
   "scripts": {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
     "lint": "eslint",
+    "test": "vitest run",
+    "test:watch": "vitest",
+    "test:ui": "vitest --ui",
     "import:marquis": "python scripts/import-marquis.py",
     "import:tf": "python scripts/import-total-fireplace.py"
   },
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 4: Add a trivial smoke test to prove the runner works**

Create `src/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it and verify it passes**

Run:
```bash
npm test
```

Expected output includes `1 passed` and the `smoke.test.ts` file name. Non-zero exit if it fails.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/__tests__/smoke.test.ts
git commit -m "Add vitest for pure-logic unit tests"
```

---

## Task 2: Centralize supply-order ship-to default

**Files:**
- Create: `src/data/shipping.ts`
- Create: `src/data/__tests__/shipping.test.ts`

The supply-order default ship-to is currently hardcoded in `AccessoryOrderForm.tsx:257` to the Angels Camp store. Move it to a single source and point it at the Arnold warehouse.

- [ ] **Step 1: Write the failing test**

Create `src/data/__tests__/shipping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_SUPPLY_SHIP_TO, DEFAULT_SUPPLY_SHIP_METHOD } from '../shipping';

describe('supply shipping defaults', () => {
  it('points to the Arnold warehouse', () => {
    expect(DEFAULT_SUPPLY_SHIP_TO).toContain('2182 Highway 4 #E540');
    expect(DEFAULT_SUPPLY_SHIP_TO).toContain('Arnold, CA 95223');
  });

  it('defaults method to UPS Ground', () => {
    expect(DEFAULT_SUPPLY_SHIP_METHOD).toBe('UPS Ground');
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run:
```bash
npm test -- shipping
```

Expected: FAIL — `Cannot find module '../shipping'`.

- [ ] **Step 3: Create `src/data/shipping.ts`**

```ts
/**
 * Default ship-to and method for supply/parts orders across all vendors.
 * Spa orders (Marquis, Sundance) still deliver to the Angels Camp showroom —
 * see `defaultMarquisDealer` / `defaultSundanceDealer` in `./dealer`.
 */
export const DEFAULT_SUPPLY_SHIP_TO = '2182 Highway 4 #E540, Arnold, CA 95223';
export const DEFAULT_SUPPLY_SHIP_METHOD = 'UPS Ground';
```

- [ ] **Step 4: Run the test — verify it passes**

Run:
```bash
npm test -- shipping
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/shipping.ts src/data/__tests__/shipping.test.ts
git commit -m "Add DEFAULT_SUPPLY_SHIP_TO for parts/supply orders (Arnold warehouse)"
```

---

## Task 3: Fix Total Fireplace order email

**Files:**
- Modify: `src/data/accessories/total-fireplace.ts:10`

The Total Fireplace `orderEmail` is currently `'info@hibernation.com'` with a `// testing — update when live` comment. Fix it.

- [ ] **Step 1: Open the file and locate line 10**

File: `src/data/accessories/total-fireplace.ts`, line 10:

```ts
  orderEmail: 'info@hibernation.com', // testing — update when live
```

- [ ] **Step 2: Replace the line**

New line 10:

```ts
  orderEmail: 'totalfireplace@yahoo.com',
```

(No comment; the value is the value.)

- [ ] **Step 3: Verify no other files reference the testing email incorrectly**

Run:
```bash
grep -rn "testing — update" src/ || echo "OK — no stale comments"
```

Expected: `OK — no stale comments`.

- [ ] **Step 4: Commit**

```bash
git add src/data/accessories/total-fireplace.ts
git commit -m "Set Total Fireplace order email to totalfireplace@yahoo.com"
```

---

## Task 4: Point AccessoryOrderForm at the supply ship-to default

**Files:**
- Modify: `src/components/AccessoryOrderForm.tsx:257`

Replace the hardcoded Angels Camp address with the new `DEFAULT_SUPPLY_SHIP_TO`.

- [ ] **Step 1: Locate the import block in `AccessoryOrderForm.tsx`**

Open the file. Find the top of the file where other `@/data/*` imports live. Add:

```ts
import { DEFAULT_SUPPLY_SHIP_TO } from '@/data/shipping';
```

If this import already exists (unlikely), skip this step.

- [ ] **Step 2: Replace the hardcoded shipping line**

At `src/components/AccessoryOrderForm.tsx:257`:

```ts
        shippingAddress: '2122 Highway 49 Suite D, Angels Camp, CA (Appointment Required - 24 Hour Notice)',
```

Replace with:

```ts
        shippingAddress: DEFAULT_SUPPLY_SHIP_TO,
```

- [ ] **Step 3: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: no TS errors. If there are errors unrelated to this change, note them but continue.

- [ ] **Step 4: Lint**

Run:
```bash
npm run lint
```

Expected: no new lint errors introduced by this change.

- [ ] **Step 5: Manual smoke test**

Run:
```bash
npm run dev
```

In the app, open an accessories order (Marquis or Total Fireplace) and confirm the ship-to field is pre-filled with `2182 Highway 4 #E540, Arnold, CA 95223`. Field must remain editable.

- [ ] **Step 6: Commit**

```bash
git add src/components/AccessoryOrderForm.tsx
git commit -m "Default supply orders to Arnold warehouse ship-to"
```

---

## Task 5: Travis types

**Files:**
- Create: `src/types/travis.ts`

Define the core types used by the Travis data layer and (in Plan 2/3) the UI + API.

- [ ] **Step 1: Write the types**

Create `src/types/travis.ts`:

```ts
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
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: no errors. The types are self-contained and introduce no dependencies.

- [ ] **Step 3: Commit**

```bash
git add src/types/travis.ts
git commit -m "Add Travis types (TravisProduct, TravisPartsQueue)"
```

---

## Task 6: Travis dealer info and freight default

**Files:**
- Modify: `src/data/dealer.ts`
- Create: `src/data/__tests__/dealer-travis.test.ts`

Add `defaultTravisDealer` and `DEFAULT_TRAVIS_STOVES_FREIGHT` alongside the existing Marquis/Sundance values.

- [ ] **Step 1: Write the failing test**

Create `src/data/__tests__/dealer-travis.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultTravisDealer, DEFAULT_TRAVIS_STOVES_FREIGHT } from '../dealer';

describe('defaultTravisDealer', () => {
  it('has the CA419 dealer number', () => {
    expect(defaultTravisDealer.dealerNumber).toBe('CA419');
  });

  it('defaults payment method to Invoice', () => {
    expect(defaultTravisDealer.paymentMethod).toBe('Invoice');
  });

  it('ships stoves to the Angels Camp showroom', () => {
    expect(defaultTravisDealer.shippingAddress).toContain('2122 Highway 49');
    expect(defaultTravisDealer.shippingAddress).toContain('Angels Camp');
  });

  it('names the dealer Hibernation Stoves & Spas', () => {
    expect(defaultTravisDealer.dealerName).toBe('Hibernation Stoves & Spas');
  });
});

describe('DEFAULT_TRAVIS_STOVES_FREIGHT', () => {
  it('defaults to 0 — freight is quoted by Travis per order', () => {
    expect(DEFAULT_TRAVIS_STOVES_FREIGHT).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run:
```bash
npm test -- dealer-travis
```

Expected: FAIL — `defaultTravisDealer is not exported` (or similar).

- [ ] **Step 3: Extend `src/data/dealer.ts`**

At the end of the file, add:

```ts
export const defaultTravisDealer: DealerInfo = {
  dealerName: 'Hibernation Stoves & Spas',
  dealerNumber: 'CA419',
  orderedBy: 'Jeremy Carlson',
  email: 'jeremy@hibernation.com',
  shippingAddress: '2122 Highway 49 Suite D, Angels Camp, CA 95222',
  phone: '209-795-4339',
  lastName: '',
  orderDate: new Date().toISOString().split('T')[0],
  paymentMethod: 'Invoice',
};

export const DEFAULT_TRAVIS_STOVES_FREIGHT = 0;
```

Note the Angels Camp address uses the shorter form (no "Appointment Required" suffix) because LTL carriers handle delivery coordination directly.

- [ ] **Step 4: Run the test — verify it passes**

Run:
```bash
npm test -- dealer-travis
```

Expected: PASS (all 5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/data/dealer.ts src/data/__tests__/dealer-travis.test.ts
git commit -m "Add defaultTravisDealer (CA419) and zero-default Travis freight"
```

---

## Task 7: Python helper package for the Travis import

**Files:**
- Create: `scripts/import_travis/__init__.py`
- Create: `scripts/import_travis/classify.py`
- Create: `scripts/tests/__init__.py`
- Create: `scripts/tests/test_classify.py`
- Create: `scripts/import-travis-overrides.json`

Extract the classifier (anchor-vs-sub-item) into a standalone module so we can unit-test it with pytest before wiring up the full PDF pipeline.

- [ ] **Step 1: Confirm pytest is available**

Run:
```bash
python -c "import pytest; print(pytest.__version__)"
```

Expected: prints a version (e.g. `8.3.3`). If the import fails:

```bash
python -m pip install pytest pdfplumber
```

- [ ] **Step 2: Write the failing classifier test**

Create `scripts/tests/__init__.py` (empty file) and `scripts/tests/test_classify.py`:

```python
"""
Unit tests for the Travis PDF classifier.

A "page item" is one parsed row: {sku, name, is_top_of_page, has_level_columns, ...}.
The classifier decides whether each item is a 'stoves' anchor (stove/fireplace/insert/
freestanding/linear/complete-fire-pit) or 'parts' (log set, conversion kit, accessory,
replacement).
"""
import json
from pathlib import Path

import pytest

from import_travis.classify import classify_item, load_overrides


def _item(sku, name, is_top=False, has_levels=False, page=1):
    return {
        "sku": sku,
        "name": name,
        "is_top_of_page": is_top,
        "has_level_columns": has_levels,
        "page": page,
    }


def test_top_of_page_item_with_level_columns_is_a_stove():
    item = _item("98500277", "564 TRV 25K Deluxe GSR2", is_top=True, has_levels=True)
    assert classify_item(item, overrides={}) == "stoves"


def test_log_set_is_a_part():
    item = _item("94500624", "LOG SET, FPL 36 564 DLX BIRCH", has_levels=False)
    assert classify_item(item, overrides={}) == "parts"


def test_lp_conversion_is_a_part():
    item = _item("94400999", "STEPPER, GSR LP CONV 4PK", has_levels=False)
    assert classify_item(item, overrides={}) == "parts"


def test_non_top_item_with_levels_is_still_a_part():
    # e.g. a second stove variant on the same page; rare but possible.
    # Unless it's the top item, treat as part.
    item = _item("98500999", "564 TRV 25K Optional Variant", is_top=False, has_levels=True)
    assert classify_item(item, overrides={}) == "parts"


def test_override_forces_stoves():
    overrides = {"94500624": "stoves"}  # override the log set (absurd but tests the mechanic)
    item = _item("94500624", "LOG SET, FPL 36 564 DLX BIRCH", has_levels=False)
    assert classify_item(item, overrides=overrides) == "stoves"


def test_override_forces_parts():
    overrides = {"98500277": "parts"}
    item = _item("98500277", "564 TRV 25K Deluxe GSR2", is_top=True, has_levels=True)
    assert classify_item(item, overrides=overrides) == "parts"


def test_load_overrides_returns_empty_dict_when_file_missing(tmp_path):
    missing = tmp_path / "does-not-exist.json"
    assert load_overrides(missing) == {}


def test_load_overrides_parses_json_file(tmp_path):
    path = tmp_path / "overrides.json"
    path.write_text(json.dumps({"SKU-1": "stoves", "SKU-2": "parts"}))
    assert load_overrides(path) == {"SKU-1": "stoves", "SKU-2": "parts"}


def test_load_overrides_rejects_invalid_values(tmp_path):
    path = tmp_path / "overrides.json"
    path.write_text(json.dumps({"SKU-1": "invalid-value"}))
    with pytest.raises(ValueError, match="must be 'stoves' or 'parts'"):
        load_overrides(path)
```

- [ ] **Step 3: Run the test — verify it fails**

Run:
```bash
cd scripts && python -m pytest tests/test_classify.py -v
```

Expected: FAIL (collection error — `ModuleNotFoundError: No module named 'import_travis'`).

- [ ] **Step 4: Implement the classifier**

Create `scripts/import_travis/__init__.py` (empty).

Create `scripts/import_travis/classify.py`:

```python
"""
Classify parsed Travis catalog items as 'stoves' anchor products or 'parts' sub-items.

Classification rule (first-cut):
  - If there's an override for this SKU, honor it.
  - Else, if the item is the first row on its page AND has the Level-1..4/50+ column
    structure (has_level_columns=True), it's a stove/fireplace/insert (anchor product).
  - Otherwise it's a part.

Overrides live in scripts/import-travis-overrides.json and are meant as an escape
hatch for edge cases — linear see-thrus, fire-pit burners, etc. — where the
classifier guesses wrong.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Literal, TypedDict


Classification = Literal["stoves", "parts"]


class PageItem(TypedDict, total=False):
    sku: str
    name: str
    is_top_of_page: bool
    has_level_columns: bool
    page: int


def classify_item(item: PageItem, overrides: Dict[str, str]) -> Classification:
    sku = item["sku"]
    if sku in overrides:
        return overrides[sku]  # type: ignore[return-value]
    if item.get("is_top_of_page") and item.get("has_level_columns"):
        return "stoves"
    return "parts"


def load_overrides(path: Path) -> Dict[str, Classification]:
    if not path.exists():
        return {}
    raw = json.loads(path.read_text())
    for sku, value in raw.items():
        if value not in ("stoves", "parts"):
            raise ValueError(
                f"Override for SKU {sku!r} is {value!r}; must be 'stoves' or 'parts'"
            )
    return raw
```

- [ ] **Step 5: Create an empty overrides file**

Create `scripts/import-travis-overrides.json`:

```json
{}
```

- [ ] **Step 6: Run the tests — verify they all pass**

Run:
```bash
cd scripts && python -m pytest tests/test_classify.py -v
```

Expected: 9 passed (one test per `test_*` function).

- [ ] **Step 7: Commit**

```bash
git add scripts/import_travis scripts/tests scripts/import-travis-overrides.json
git commit -m "Add Travis PDF classifier with pytest coverage"
```

---

## Task 8: Travis PDF parser — page extraction

**Files:**
- Create: `scripts/import_travis/parse.py`
- Create: `scripts/tests/test_parse.py`
- Create: `scripts/tests/fixtures/` (directory)

Parse per-page items out of the PDF. The parser's job: given a `pdfplumber.Page`, return a list of `PageItem` dicts (one per SKU found). Price extraction uses the **Level 4 (50%)** column for anchor items and the **Cost** column for sub-items.

- [ ] **Step 1: Create a fixture PDF with one page from the real catalog**

Run the following from the project root to extract page 3 (the 564 TRV 25K anchor page) of the real Travis catalog as a one-page fixture:

```bash
python -c "
from pypdf import PdfReader, PdfWriter
reader = PdfReader('docs/travis-industries-catalogHouseofFireDealerCost.pdf')
writer = PdfWriter()
writer.add_page(reader.pages[2])  # zero-indexed — page 3 in the PDF
with open('scripts/tests/fixtures/travis-page-3.pdf', 'wb') as f:
    writer.write(f)
print('wrote scripts/tests/fixtures/travis-page-3.pdf')
"
```

Expected: `wrote scripts/tests/fixtures/travis-page-3.pdf`. The file should be ≈50-150KB.

- [ ] **Step 2: Write failing parser tests**

Create `scripts/tests/test_parse.py`:

```python
"""Tests for the Travis PDF parser against a real one-page fixture."""
from pathlib import Path

import pytest

from import_travis.parse import parse_page, extract_all_items

FIXTURE = Path(__file__).parent / "fixtures" / "travis-page-3.pdf"


@pytest.fixture(scope="module")
def page_3_items():
    return extract_all_items(FIXTURE)


def test_finds_anchor_stove_sku(page_3_items):
    skus = [item["sku"] for item in page_3_items]
    assert "98500277" in skus, f"Expected anchor SKU 98500277, got: {skus}"


def test_anchor_product_name(page_3_items):
    anchor = next(i for i in page_3_items if i["sku"] == "98500277")
    assert "564 TRV 25K" in anchor["name"]
    assert "Deluxe GSR2" in anchor["name"]


def test_anchor_product_has_level_columns(page_3_items):
    anchor = next(i for i in page_3_items if i["sku"] == "98500277")
    assert anchor["has_level_columns"] is True


def test_anchor_product_is_first_on_page(page_3_items):
    anchor = next(i for i in page_3_items if i["sku"] == "98500277")
    assert anchor["is_top_of_page"] is True


def test_anchor_tier_4_price(page_3_items):
    # Level 4 (50%) for the 564 TRV 25K — from the user's PDF read: $2,145
    anchor = next(i for i in page_3_items if i["sku"] == "98500277")
    assert anchor["price"] == 2145


def test_log_set_parts_are_found(page_3_items):
    skus = [item["sku"] for item in page_3_items]
    assert "94500624" in skus, "Expected log set 94500624 on page 3"


def test_log_set_price_uses_cost_column(page_3_items):
    # LOG SET, FPL 36 564 DLX BIRCH — Cost column is $236
    log_set = next(i for i in page_3_items if i["sku"] == "94500624")
    assert log_set["price"] == 236


def test_log_set_is_not_top_of_page(page_3_items):
    log_set = next(i for i in page_3_items if i["sku"] == "94500624")
    assert log_set["is_top_of_page"] is False


def test_lp_conversion_cost(page_3_items):
    # STEPPER, GSR LP CONV 4PK — Cost is $180
    lp = next(i for i in page_3_items if i["sku"] == "94400999")
    assert lp["price"] == 180
    assert lp["is_top_of_page"] is False


def test_weight_captured_when_present(page_3_items):
    anchor = next(i for i in page_3_items if i["sku"] == "98500277")
    assert anchor.get("weightLbs") == 201
```

- [ ] **Step 3: Run the tests — verify they fail**

Run:
```bash
cd scripts && python -m pytest tests/test_parse.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'import_travis.parse'`.

- [ ] **Step 4: Implement the parser**

Create `scripts/import_travis/parse.py`:

```python
"""
Parse Travis dealer-cost PDF pages into PageItem dicts.

Strategy:
  - Open the PDF with pdfplumber.
  - For each page, extract tables AND text separately (tables catch structured rows,
    text catches headings + free-form descriptions).
  - Detect "anchor" rows by the presence of the Level 1/2/3/4/50+ column headers at
    the top of a table on the page.
  - Sub-items (log sets, LP conversion, accessories) use the Cost/Sale Price/MSRP
    column header, which always appears lower on the page.
  - For anchor rows, read the Level 4 (50%) column.
  - For sub-item rows, read the Cost column.

The Travis PDF is consistent enough that this works for the bulk of pages; the
classifier's override mechanism handles the small number of edge cases.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable, List

import pdfplumber

# A SKU is either:
#   - 8 digits (most internal SKUs: 98500277, 94500624)
#   - or starts with a 3-digit prefix + dash + alnum (e.g. 250-01463)
SKU_PATTERN = re.compile(r"\b(\d{8}|\d{3}-\d{4,5})\b")

# Price in the PDF looks like "$2,145" or "$236" or "$79"
PRICE_PATTERN = re.compile(r"\$([\d,]+)")

# Weight column: just digits followed by whitespace and a $, or end-of-cell
WEIGHT_IN_ROW = re.compile(r"\b(\d{1,4})\b\s+\$")


def _money_to_int(s: str) -> int:
    """Parse '$2,145' or '2,145' into 2145."""
    m = PRICE_PATTERN.search(s) if s.startswith("$") else re.search(r"([\d,]+)", s)
    if not m:
        raise ValueError(f"Can't parse price from: {s!r}")
    return int(m.group(1).replace(",", ""))


def _cell_prices(row: List[str]) -> List[int]:
    """Return all $-prefixed integer prices in a row, in order."""
    prices: List[int] = []
    for cell in row:
        if not cell:
            continue
        for m in PRICE_PATTERN.finditer(cell):
            try:
                prices.append(int(m.group(1).replace(",", "")))
            except ValueError:
                pass
    return prices


def parse_page(page: pdfplumber.page.Page, page_number: int) -> List[dict]:
    """
    Parse a single page. Returns a list of PageItem dicts.

    - The first SKU found at the top of the page is marked is_top_of_page=True.
    - has_level_columns is True if the anchor-style header ("Level 1 ... Level 4 ... 50+ Factory")
      appears above the SKU's row.
    """
    text = page.extract_text() or ""
    tables = page.extract_tables() or []

    # Detect anchor header presence anywhere on the page.
    header_text = text.lower()
    has_levels_header = (
        "level 1" in header_text
        and "level 4" in header_text
        and ("50+" in header_text or "factory" in header_text)
    )

    items: List[dict] = []
    seen_skus: set[str] = set()

    for table in tables:
        # Each row is a list of cells.
        for row in table:
            if not row:
                continue
            row_text = " ".join(cell or "" for cell in row)
            sku_match = SKU_PATTERN.search(row_text)
            if not sku_match:
                continue
            sku = sku_match.group(1)
            if sku in seen_skus:
                continue

            prices = _cell_prices(row)
            # Anchor rows: columns Level 1, Level 2, Level 3, Level 4, 50+ factory, Sale, MSRP
            # → 7 prices; Level 4 is index 3.
            # Sub-item rows: Cost, Sale Price, MSRP → 3 prices; Cost is index 0.
            if len(prices) >= 5 and has_levels_header:
                price = prices[3]  # Level 4
                has_level_columns = True
            elif prices:
                price = prices[0]  # Cost column
                has_level_columns = False
            else:
                # Row has SKU but no price — skip (header rows, footnotes, etc.)
                continue

            # Weight is the first plain-integer cell before the $ prices, if any.
            weight = None
            for cell in row:
                if not cell:
                    continue
                m = re.match(r"^\s*(\d{1,4})\s*$", cell)
                if m:
                    weight = int(m.group(1))
                    break

            # Name: the longest alphanumeric cell that isn't pure digits or pure money.
            name_candidates = [
                c for c in row
                if c and not c.startswith("$") and not re.match(r"^\d+$", c.strip())
            ]
            name = max(name_candidates, key=len).strip() if name_candidates else sku
            # Strip the SKU and any leading "Model" label from the name if present.
            name = name.replace(sku, "").strip()
            name = re.sub(r"^(Model\s+)?", "", name).strip()

            items.append({
                "sku": sku,
                "name": name,
                "price": price,
                "is_top_of_page": len(items) == 0,
                "has_level_columns": has_level_columns,
                "page": page_number,
                "weightLbs": weight,
            })
            seen_skus.add(sku)

    return items


def extract_all_items(pdf_path: Path) -> List[dict]:
    """Open the PDF and parse every page, returning a flat list of items."""
    items: List[dict] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for i, page in enumerate(pdf.pages):
            items.extend(parse_page(page, page_number=i + 1))
    return items
```

- [ ] **Step 5: Run the tests — verify they pass**

Run:
```bash
cd scripts && python -m pytest tests/test_parse.py -v
```

Expected: 10 passed. If any fail:
1. Read the failure output to see what the parser found.
2. Adjust `parse_page` to handle the specific shape of the fixture.
3. Re-run until all tests pass.

If pdfplumber returns no tables for the fixture page (can happen with image-heavy layouts), fall back to line-based text extraction. Do not stub the test — fix the parser.

- [ ] **Step 6: Commit**

```bash
git add scripts/import_travis/parse.py scripts/tests/test_parse.py scripts/tests/fixtures/travis-page-3.pdf
git commit -m "Add Travis PDF page parser with fixture-based tests"
```

---

## Task 9: Travis import script — end-to-end generation

**Files:**
- Create: `scripts/import-travis.py`
- Modify: `package.json`

Wire the parser and classifier together into a runnable script that produces `src/data/travis/stoves.ts` and `src/data/travis/parts.ts`.

- [ ] **Step 1: Ensure the `.scrape/` intermediate dir is gitignored**

Run:
```bash
grep -q "^.scrape/$" .gitignore || echo ".scrape/" >> .gitignore
```

- [ ] **Step 2: Write the driver script**

Create `scripts/import-travis.py`:

```python
#!/usr/bin/env python3
"""
Import Travis Industries dealer-cost PDF into TypeScript catalog files.

Reads:  docs/travis-industries-catalogHouseofFireDealerCost.pdf
Writes: src/data/travis/stoves.ts
        src/data/travis/parts.ts
Cache:  .scrape/travis-parsed.json  (intermediate — lets you re-run classification
                                      without re-parsing the PDF)

Classification overrides live in scripts/import-travis-overrides.json.

Usage:
  python scripts/import-travis.py             # full run
  python scripts/import-travis.py --no-parse  # re-use cached parse, re-classify only
"""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Dict, List

from import_travis.classify import classify_item, load_overrides
from import_travis.parse import extract_all_items

ROOT = Path(__file__).resolve().parent.parent
PDF_PATH = ROOT / "docs" / "travis-industries-catalogHouseofFireDealerCost.pdf"
CACHE_PATH = ROOT / ".scrape" / "travis-parsed.json"
OVERRIDES_PATH = ROOT / "scripts" / "import-travis-overrides.json"
OUT_STOVES = ROOT / "src" / "data" / "travis" / "stoves.ts"
OUT_PARTS = ROOT / "src" / "data" / "travis" / "parts.ts"


def ts_escape(s: str) -> str:
    """Escape a string for a TypeScript single-quoted literal."""
    return s.replace("\\", "\\\\").replace("'", "\\'")


def emit_ts(items: List[dict], out_path: Path, export_name: str, description: str) -> None:
    today = date.today().isoformat()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "// AUTO-GENERATED — do NOT edit by hand.",
        "// Re-run `npm run import:travis` to regenerate from",
        "// docs/travis-industries-catalogHouseofFireDealerCost.pdf.",
        "",
        "import { TravisProduct } from '@/types/travis';",
        "",
        f"/** {description} */",
        f"export const {export_name}: TravisProduct[] = [",
    ]
    for item in items:
        fields: List[str] = [
            f"    sku: '{ts_escape(item['sku'])}'",
            f"    name: '{ts_escape(item['name'])}'",
            f"    price: {item['price']}",
        ]
        if item.get("weightLbs") is not None:
            fields.append(f"    weightLbs: {int(item['weightLbs'])}")
        fields.append(f"    source: 'pricelist'")
        fields.append(f"    lastUpdated: '{today}'")
        lines.append("  {")
        lines.append(",\n".join(fields) + ",")
        lines.append("  },")
    lines.append("];")
    lines.append("")
    out_path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-parse", action="store_true",
                        help="Skip PDF parse; reuse .scrape/travis-parsed.json")
    args = parser.parse_args()

    overrides = load_overrides(OVERRIDES_PATH)

    if args.no_parse and CACHE_PATH.exists():
        print(f"Loading cached parse from {CACHE_PATH}")
        items = json.loads(CACHE_PATH.read_text())
    else:
        print(f"Parsing {PDF_PATH} ...")
        items = extract_all_items(PDF_PATH)
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(json.dumps(items, indent=2))
        print(f"Cached parse to {CACHE_PATH} ({len(items)} items)")

    stoves: List[dict] = []
    parts: List[dict] = []
    for item in items:
        dest = classify_item(item, overrides)
        (stoves if dest == "stoves" else parts).append(item)

    # Sort for diff-friendly output.
    stoves.sort(key=lambda i: i["sku"])
    parts.sort(key=lambda i: i["sku"])

    emit_ts(stoves, OUT_STOVES, "travisStoves",
            "Travis stoves, fireplaces, inserts, and freestanding units (Tier 4 dealer cost).")
    emit_ts(parts, OUT_PARTS, "travisParts",
            "Travis parts, log sets, conversion kits, and accessories (Cost column).")

    print(f"Wrote {len(stoves)} stoves → {OUT_STOVES}")
    print(f"Wrote {len(parts)} parts → {OUT_PARTS}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Add the `import:travis` npm script**

Edit `package.json`:

```diff
     "import:marquis": "python scripts/import-marquis.py",
-    "import:tf": "python scripts/import-total-fireplace.py"
+    "import:tf": "python scripts/import-total-fireplace.py",
+    "import:travis": "python scripts/import-travis.py"
```

- [ ] **Step 4: Run the import**

Run:
```bash
npm run import:travis
```

Expected output:
- `Parsing docs/travis-industries-catalogHouseofFireDealerCost.pdf ...`
- `Cached parse to .scrape/travis-parsed.json (N items)` where N is between 300 and 2000
- `Wrote M stoves → src/data/travis/stoves.ts`
- `Wrote P parts → src/data/travis/parts.ts`
- M roughly 30-80, P roughly 200-1500 (depends on catalog detail)

- [ ] **Step 5: Spot-check the output**

Run:
```bash
head -40 src/data/travis/stoves.ts
```

Expected: clean TS exporting `travisStoves: TravisProduct[]` with known anchor SKUs present. `564 TRV 25K Deluxe GSR2` and `98500277` must appear.

Run:
```bash
grep -c "sku: '" src/data/travis/stoves.ts
grep -c "sku: '" src/data/travis/parts.ts
```

Expected: count matches the M and P totals from step 4.

Run:
```bash
grep "98500277" src/data/travis/stoves.ts | head -5
grep "94500624" src/data/travis/parts.ts | head -5
```

Expected: both SKUs appear in their expected file (98500277 is a stove; 94500624 is a log-set part).

If the 564 TRV 25K anchor ends up in `parts.ts` instead of `stoves.ts`, that means the classifier misread the page — either the page's table extraction returned the SKU on a non-first row, or `has_level_columns` wasn't detected. Debug by running the parser standalone on that page and iterate.

- [ ] **Step 6: Type-check generated files**

Run:
```bash
npx tsc --noEmit
```

Expected: no errors in the new `src/data/travis/*.ts` files. If there are issues:
- Missing `@/types/travis` → Task 5 was skipped; go fix.
- TS syntax errors in the generated file → fix `emit_ts()` and re-run import.

- [ ] **Step 7: Commit (separate commit for generated files)**

```bash
git add scripts/import-travis.py package.json .gitignore
git commit -m "Add Travis PDF import driver script"

git add src/data/travis/stoves.ts src/data/travis/parts.ts
git commit -m "Import Travis Industries catalog (Tier 4 dealer cost)"
```

---

## Task 10: Travis data layer

**Files:**
- Create: `src/data/travis/parts-manual.ts`
- Create: `src/data/travis/index.ts`
- Create: `src/data/travis/__tests__/index.test.ts`

Provide a single import surface — `@/data/travis` — that merges `travisStoves`, `travisParts`, and `parts-manual.ts`. The KV-pending-merge layer (runtime KV reads) is Plan 2/3 scope and is deliberately skipped here; `index.ts` exposes pure, synchronous data only.

- [ ] **Step 1: Create the empty manual-parts file**

Create `src/data/travis/parts-manual.ts`:

```ts
// Hand-maintained / GH-Actions-sync target for manually-added Travis parts.
// See docs/superpowers/specs/2026-04-21-travis-industries-ordering-design.md
// ("Manual-parts storage (hybrid KV + TS)").
//
// Entries added here via the weekly GitHub Actions sync workflow (Plan 3).
// Safe to edit by hand if needed.

import { TravisProduct } from '@/types/travis';

export const travisPartsManual: TravisProduct[] = [];
```

- [ ] **Step 2: Write the failing index test**

Create `src/data/travis/__tests__/index.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test — verify it fails**

Run:
```bash
npm test -- travis/__tests__/index
```

Expected: FAIL — `Cannot find module '../index'`.

- [ ] **Step 4: Implement the data layer**

Create `src/data/travis/index.ts`:

```ts
/**
 * Travis Industries catalog — unified read surface.
 *
 * Combines:
 *   - travisStoves  (AUTO-GENERATED by scripts/import-travis.py)
 *   - travisParts   (AUTO-GENERATED)
 *   - travisPartsManual (hand-maintained / GH-Actions-sync target)
 *
 * Runtime KV pending-additions are NOT merged here — that happens in the API
 * routes (Plan 2 & 3) so this module stays synchronous and pure.
 */
import { TravisProduct } from '@/types/travis';
import { travisStoves } from './stoves';
import { travisParts } from './parts';
import { travisPartsManual } from './parts-manual';

/** All Travis products, deduplicated by SKU (manual > parts > stoves wins on conflict). */
export const travisCatalog: TravisProduct[] = dedupeBySKU([
  ...travisStoves,
  ...travisParts,
  ...travisPartsManual,
]);

/** Indexed lookup, built once at module load. */
const BY_SKU: Map<string, TravisProduct> = new Map(
  travisCatalog.map(p => [p.sku.toUpperCase(), p])
);

export function findTravisProduct(sku: string): TravisProduct | undefined {
  return BY_SKU.get(sku.trim().toUpperCase());
}

/**
 * Search by SKU prefix or name substring. Returns up to `limit` matches,
 * with SKU-prefix matches ranked ahead of name matches.
 */
export function searchTravisProducts(query: string, limit = 20): TravisProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const skuMatches: TravisProduct[] = [];
  const nameMatches: TravisProduct[] = [];

  for (const p of travisCatalog) {
    if (p.sku.toLowerCase().startsWith(q)) {
      skuMatches.push(p);
    } else if (p.name.toLowerCase().includes(q)) {
      nameMatches.push(p);
    }
    if (skuMatches.length >= limit) break;
  }

  return [...skuMatches, ...nameMatches].slice(0, limit);
}

function dedupeBySKU(products: TravisProduct[]): TravisProduct[] {
  const seen = new Map<string, TravisProduct>();
  for (const p of products) {
    // Later entries win — that's why the input order is stoves → parts → manual.
    seen.set(p.sku.toUpperCase(), p);
  }
  return Array.from(seen.values());
}

export { travisStoves, travisParts, travisPartsManual };
```

- [ ] **Step 5: Run the tests — verify they pass**

Run:
```bash
npm test -- travis
```

Expected: all tests in `src/data/travis/__tests__/index.test.ts` PASS. If any fail:
- Duplicate-SKU test failing → `scripts/import-travis.py` has a bug where the same SKU appears in both stoves and parts. Dig into the override logic.
- SKU 98500277 not in stoves → Task 9 classifier misfire; add `"98500277": "stoves"` to `scripts/import-travis-overrides.json` and re-run `npm run import:travis`.

- [ ] **Step 6: Commit**

```bash
git add src/data/travis/parts-manual.ts src/data/travis/index.ts src/data/travis/__tests__
git commit -m "Add Travis data layer with catalog merge and SKU lookup"
```

---

## Task 11: Final smoke test and documentation touch-up

**Files:**
- Modify: `CLAUDE.md`

Verify the full stack and document the new `npm run import:travis` command in the project's CLAUDE.md so it's discoverable.

- [ ] **Step 1: Run the full test suite**

Run:
```bash
npm test
```

Expected: all tests pass. Green across shipping, dealer-travis, travis/__tests__, and the smoke test. If anything is red, fix before proceeding.

- [ ] **Step 2: Run typecheck and lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```

Expected: zero errors.

- [ ] **Step 3: Run the dev server and smoke-test the collateral fixes**

Run:
```bash
npm run dev
```

In the browser:
1. Open an accessories order — confirm ship-to is pre-filled with `2182 Highway 4 #E540, Arnold, CA 95223`, NOT Angels Camp.
2. Select Total Fireplace vendor — confirm the order email field shows `totalfireplace@yahoo.com` in the send payload (if visible anywhere in the UI) OR check `src/data/accessories/total-fireplace.ts:10` is correct.
3. Open a Marquis or Sundance **spa** order (not accessories) — confirm ship-to is STILL `2122 Highway 49 Suite D, Angels Camp` (spa delivery is unchanged).

- [ ] **Step 4: Run the pytest suite**

Run:
```bash
cd scripts && python -m pytest tests/ -v
```

Expected: all 19 tests pass (9 classifier + 10 parser).

- [ ] **Step 5: Update CLAUDE.md with the new import command**

Open `CLAUDE.md`. Find the "Common Tasks" section. Add under the existing commands:

```markdown
### Importing the Travis Industries catalog
Re-run after the 2026 dealer-cost PDF is updated in `docs/`:
```bash
npm run import:travis
```
Outputs: `src/data/travis/stoves.ts` (anchor products) and `src/data/travis/parts.ts`
(log sets, conversion kits, accessories). Uses Tier 4 pricing (50% column for
anchors, Cost column for sub-items). Classification overrides live in
`scripts/import-travis-overrides.json`.
```

- [ ] **Step 6: Commit documentation**

```bash
git add CLAUDE.md
git commit -m "Document npm run import:travis in CLAUDE.md"
```

- [ ] **Step 7: Final status check**

Run:
```bash
git log --oneline main..HEAD
```

Expected: a clean series of commits, one per task, telling the story of the plan. If any commits were squashed or missed, that's fine — but ensure every change is committed and `git status` is clean.

Run:
```bash
git status
```

Expected: `working tree clean` (and ideally ahead of `origin/main` by the number of commits in this plan).

---

## Self-Review (plan author's own check — done inline, don't execute)

- **Spec coverage:**
  - ✅ Types (Task 5)
  - ✅ Dealer info CA419, payment=Invoice (Task 6)
  - ✅ Freight default = 0 (Task 6)
  - ✅ Catalog files stoves.ts/parts.ts/parts-manual.ts/index.ts (Tasks 9, 10)
  - ✅ Import script with overrides (Tasks 7, 8, 9)
  - ✅ Tier 4 pricing (Task 8 — Level 4 column)
  - ✅ Total Fireplace email fix (Task 3)
  - ✅ Supply-ship-to centralization (Tasks 2, 4)
  - ❌ OUT OF SCOPE for Plan 1 (deferred to Plan 2/3): home-screen card, Travis UI, API routes, scheduler, GH Actions sync. The plan explicitly calls these out in the File Structure section.
  - ❌ NOT COVERED (deliberately): order-history type discriminant — deferred to Plan 2 when the first Travis order actually lands in history. The spec's `OrderType = 'spa' | 'stove' | 'supplies'` already fits Travis (stove for stoves, supplies for parts) without a code change. Revisit if Plan 2 needs finer granularity.

- **Placeholder scan:** No "TBD", "TODO", "similar to above", or vague-direction steps. Every code step has complete code.

- **Type consistency:** `TravisProduct` defined once in Task 5 and referenced consistently in Tasks 9, 10. `DEFAULT_SUPPLY_SHIP_TO` defined in Task 2, consumed in Task 4. `defaultTravisDealer` defined in Task 6, not consumed in this plan (first consumer is Plan 2). `classify_item` signature matches between Task 7 test and Task 7 implementation.

- **Scope check:** Plan 1 is self-contained — every file created is either used within Plan 1 (tested + verified) or is a zero-cost stub (`parts-manual.ts`, empty). No dangling exports. Ships independently: collateral fixes are user-visible wins; Travis catalog is queryable from a Node REPL (`node -e "require('./src/data/travis').travisCatalog"` after a build step).
