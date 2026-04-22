"""
Parse Travis dealer-cost PDF pages into PageItem dicts.

Strategy:
  - Open the PDF with pdfplumber.
  - For each page, extract tables separately (tables catch all structured rows).
  - Detect "anchor" tables by the presence of Level 1/2/3/4/50+ column headers in
    the first row. Anchor tables use the Level 4 (50%) column for pricing.
  - Sub-item tables (log sets, LP conversion, accessories) use a Cost/Sale/MSRP
    column header. Sub-item tables use the Cost column for pricing.
  - Column indices are determined from the header row of each table, not hard-coded,
    so the parser is robust to minor layout shifts.

The Travis PDF is consistent enough that this works for the bulk of pages; the
classifier's override mechanism handles the small number of edge cases.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import List, Optional

import pdfplumber

# A SKU is either:
#   - 8 digits (most internal SKUs: 98500277, 94500624)
#   - or starts with a 3-digit prefix + dash + alnum (e.g. 250-01463)
SKU_PATTERN = re.compile(r"\b(\d{8}|\d{3}-\d{4,5})\b")

# Price in the PDF looks like "$2,145" or "$236" or "$79"
PRICE_PATTERN = re.compile(r"\$([\d,]+)")


def _money_to_int(s: str) -> Optional[int]:
    """Parse the first '$N,NNN' from a string into an int. Returns None if not found."""
    if not s:
        return None
    m = PRICE_PATTERN.search(s)
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _find_col(header_row: List[Optional[str]], *keywords: str) -> Optional[int]:
    """
    Return the index of the first header cell whose text contains any of the keywords
    (case-insensitive). Returns None if not found.
    """
    for i, cell in enumerate(header_row):
        if not cell:
            continue
        cell_lower = cell.lower()
        if any(kw.lower() in cell_lower for kw in keywords):
            return i
    return None


def _is_anchor_header(header_row: List[Optional[str]]) -> bool:
    """True if this table header contains Level 1 … Level 4 columns."""
    text = " ".join(c for c in header_row if c).lower()
    return "level 1" in text and "level 4" in text


def _is_subitem_header(header_row: List[Optional[str]]) -> bool:
    """True if this table header is the sub-item style (SKU #, Cost, Sale Price, MSRP)."""
    text = " ".join(c for c in header_row if c).lower()
    return "cost" in text and "sku" in text and "level" not in text


def _first_line(cell: Optional[str]) -> str:
    """Return the first non-empty line of a (possibly multi-line) cell."""
    if not cell:
        return ""
    for line in cell.splitlines():
        line = line.strip()
        if line:
            return line
    return ""


def _clean_name(raw: str) -> str:
    """
    Extract a clean product name from a table cell that may contain multi-line
    descriptions. Takes the first 1-2 lines that look like a product name
    (not a pure-number or pure-dollar string).
    """
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    name_lines = []
    for line in lines:
        # Stop at lines that are obviously description text (long sentences)
        if len(line) > 60 and " " in line:
            break
        # Skip pure-number lines and price lines
        if re.match(r"^\d[\d,\.]*$", line) or line.startswith("$"):
            continue
        # Skip lines that look like pack/price labels (e.g. "2 PACK", "PRICE PER", "UNIT")
        if re.match(r"^(2 PACK|PRICE PER|UNIT|\d+ PACK)$", line, re.IGNORECASE):
            continue
        name_lines.append(line)
        # Two lines is enough for "Model Name\nSubtitle"
        if len(name_lines) >= 2:
            break
    return " ".join(name_lines).strip()


def _parse_anchor_table(
    table: List[List[Optional[str]]],
    items: List[dict],
    seen_skus: set,
    is_first_table: bool,
) -> None:
    """Parse an anchor-style table (Level 1–4 pricing columns)."""
    if len(table) < 2:
        return

    header = table[0]
    level4_col = _find_col(header, "Level 4", "50%")
    sku_col = _find_col(header, "SKU")
    wt_col = _find_col(header, "WT", "Lbs")
    name_col = _find_col(header, "Model")

    # Fall back to positional guesses if header matching fails
    if sku_col is None:
        sku_col = 1
    if wt_col is None:
        wt_col = 2
    if level4_col is None:
        level4_col = 6
    if name_col is None:
        name_col = 0

    for row in table[1:]:
        if not row or len(row) <= max(sku_col, level4_col):
            continue

        # SKU cell may contain extra text like "2 PACK\nPRICE PER\nUNIT"
        sku_cell = row[sku_col] or ""
        sku_match = SKU_PATTERN.search(sku_cell)
        if not sku_match:
            continue
        sku = sku_match.group(1)
        if sku in seen_skus:
            continue

        price = _money_to_int(row[level4_col] or "")
        if price is None:
            continue

        # Weight: plain integer cell
        weight = None
        if wt_col < len(row) and row[wt_col]:
            m = re.match(r"^\s*(\d{1,4})\s*$", row[wt_col])
            if m:
                weight = int(m.group(1))

        name = _clean_name(row[name_col] or "") if name_col < len(row) else sku

        items.append({
            "sku": sku,
            "name": name,
            "price": price,
            "is_top_of_page": len(items) == 0 and is_first_table,
            "has_level_columns": True,
            "weightLbs": weight,
        })
        seen_skus.add(sku)


def _parse_subitem_table(
    table: List[List[Optional[str]]],
    items: List[dict],
    seen_skus: set,
) -> None:
    """Parse a sub-item table (Cost / Sale Price / MSRP columns)."""
    if len(table) < 2:
        return

    header = table[0]
    sku_col = _find_col(header, "SKU")
    cost_col = _find_col(header, "Cost")
    wt_col = _find_col(header, "WT", "Lbs")
    name_col = 0  # always the first column in Travis sub-item tables

    if sku_col is None:
        sku_col = 1
    if cost_col is None:
        cost_col = 3
    if wt_col is None:
        wt_col = 2

    for row in table[1:]:
        if not row or len(row) <= max(sku_col, cost_col):
            continue

        sku_cell = row[sku_col] or ""
        sku_match = SKU_PATTERN.search(sku_cell)
        if not sku_match:
            continue
        sku = sku_match.group(1)
        if sku in seen_skus:
            continue

        price = _money_to_int(row[cost_col] or "")
        if price is None:
            continue

        # Weight
        weight = None
        if wt_col < len(row) and row[wt_col]:
            m = re.match(r"^\s*(\d{1,4})\s*$", row[wt_col])
            if m:
                weight = int(m.group(1))

        name = _clean_name(row[name_col] or "") if name_col < len(row) else sku

        items.append({
            "sku": sku,
            "name": name,
            "price": price,
            "is_top_of_page": False,  # sub-items are never the top anchor
            "has_level_columns": False,
            "weightLbs": weight,
        })
        seen_skus.add(sku)


def parse_page(page: "pdfplumber.page.Page", page_number: int) -> List[dict]:
    """
    Parse a single pdfplumber Page. Returns a list of PageItem dicts.

    Each dict has:
      sku            str   — product SKU
      name           str   — cleaned product name
      price          int   — Level 4 (50%) price for anchors; Cost for sub-items
      is_top_of_page bool  — True for the first anchor on the page
      has_level_columns bool — True for anchor rows, False for sub-items
      page           int   — 1-based page number
      weightLbs      int|None — shipping weight in lbs, if present
    """
    tables = page.extract_tables() or []

    items: List[dict] = []
    seen_skus: set = set()

    for table_idx, table in enumerate(tables):
        if not table or not table[0]:
            continue

        header = table[0]
        if _is_anchor_header(header):
            _parse_anchor_table(table, items, seen_skus, is_first_table=(table_idx == 0))
        elif _is_subitem_header(header):
            _parse_subitem_table(table, items, seen_skus)
        # Tables with neither pattern (e.g. footnote tables) are ignored

    # Attach page number to every item
    for item in items:
        item["page"] = page_number

    return items


def extract_all_items(pdf_path: Path) -> List[dict]:
    """Open the PDF and parse every page, returning a flat list of items."""
    items: List[dict] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for i, page in enumerate(pdf.pages):
            items.extend(parse_page(page, page_number=i + 1))
    return items
