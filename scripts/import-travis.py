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
    seen_all: set = set()
    for item in items:
        sku = item["sku"]
        if sku in seen_all:
            continue
        seen_all.add(sku)
        dest = classify_item(item, overrides)
        (stoves if dest == "stoves" else parts).append(item)

    # Sort for diff-friendly output.
    stoves.sort(key=lambda i: i["sku"])
    parts.sort(key=lambda i: i["sku"])

    emit_ts(stoves, OUT_STOVES, "travisStoves",
            "Travis stoves, fireplaces, inserts, and freestanding units (Tier 4 dealer cost).")
    emit_ts(parts, OUT_PARTS, "travisParts",
            "Travis parts, log sets, conversion kits, and accessories (Cost column).")

    print(f"Wrote {len(stoves)} stoves -> {OUT_STOVES}")
    print(f"Wrote {len(parts)} parts -> {OUT_PARTS}")


if __name__ == "__main__":
    main()
