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
