#!/usr/bin/env python3
"""
Import Marquis accessories catalog from the 2026 Accessories Order Form PDF.

Reads: docs/2026 Accessories Order Form Effective 3.31.2026_2.pdf
Writes: src/data/accessories/marquis.ts

The PDF is the source of truth — it has section headers, both per-unit and per-case
prices, SKUs, and long descriptions. This script normalizes everything into the
AccessoryProduct shape used by the app.

Usage:
  python scripts/import-marquis.py
"""
from __future__ import annotations

import io
import json
import re
from pathlib import Path
from typing import Optional, TypedDict

import pdfplumber
from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
OUT_TS = ROOT / "src" / "data" / "accessories" / "marquis.ts"
INTERMEDIATE_JSON = ROOT / ".scrape" / "marquis-parsed.json"
IMG_DIR = ROOT / "public" / "marquis-imgs"


def _find_pdf() -> Path:
    """Find the Marquis PDF — supports both the clean name and the legacy name."""
    candidates = [
        ROOT / "docs" / "marquis-2026-accessories-catalog.pdf",
        ROOT / "docs" / "2026 Accessories Order Form Effective 3.31.2026_2.pdf",
    ]
    for c in candidates:
        if c.exists():
            return c
    raise SystemExit(
        f"Marquis PDF not found. Looked in:\n"
        + "\n".join(f"  - {c}" for c in candidates)
    )


PDF_PATH = _find_pdf()


class Product(TypedDict, total=False):
    sku: str
    raw_section: str
    raw_description: str
    short_name: str
    brand: Optional[str]
    description: str
    category: str
    cost_per_unit: float
    case_price: Optional[float]
    case_size: Optional[int]
    unit: str  # "each" or "case"
    image_path: Optional[str]  # web path like "/marquis-imgs/mq-23830.jpg"
    # Position metadata (stripped before JSON/TS output)
    _page: int
    _row_top: Optional[float]
    _row_bottom: Optional[float]


# ------------------------- Helpers -------------------------

def normalize(text: str) -> str:
    """Fix encoding artifacts (® etc.), normalize whitespace."""
    if not text:
        return ""
    # The PDF's ® comes through as \ufffd; reverse that by domain knowledge.
    text = text.replace("\ufffd", "®")
    text = text.replace("\u00a0", " ")  # non-breaking space
    text = text.replace("\n", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def parse_price(s: str) -> Optional[float]:
    if not s:
        return None
    s = s.strip().replace("$", "").replace(",", "")
    if not s or s == "-":
        return None
    try:
        return float(s)
    except ValueError:
        return None


# Matches "(12/cs)", "(8/cs)", "(6 kits/cs)", "12 per case", "24/case",
# "Case quantity 8", "2 boxes per case", "3 packs/cs", etc.
CASE_PATTERNS = [
    re.compile(r"\((\d+)\s*(?:kits|pcs|cs|boxes|packs|-packs|pack|box|packages)?\s*/\s*(?:cs|case)\)", re.I),
    re.compile(r"(\d+)\s*(?:kits|pcs|cs|boxes|pack|packages)?\s*per\s*case", re.I),
    re.compile(r"Case\s+quantity[:\s]+(\d+)", re.I),
    re.compile(r"(\d+)\s*/\s*cs\b", re.I),
    re.compile(r"(\d+)\s*/\s*case\b", re.I),
]


def extract_case_size(description: str) -> Optional[int]:
    for pat in CASE_PATTERNS:
        m = pat.search(description)
        if m:
            try:
                return int(m.group(1))
            except (ValueError, IndexError):
                continue
    return None


def is_sold_individually(description: str) -> bool:
    return bool(re.search(r"sold\s+individually", description, re.I))


# Brand detection — ordered; first match wins.
BRAND_RULES = [
    (re.compile(r"\bSpa\s*Frog®?\b", re.I), "Spa Frog"),
    (re.compile(r"@ease\s*(?:w/|with)?\s*SmartChlor®?", re.I), "@ease SmartChlor"),
    (re.compile(r"@ease\b", re.I), "@ease"),
    (re.compile(r"\bSmartChlor®?\b", re.I), "@ease SmartChlor"),
    (re.compile(r"\bSerene\b", re.I), "Serene"),
    (re.compile(r"\bMarquis®?\b", re.I), "Marquis"),
    (re.compile(r"^303\b", re.I), "303"),
    (re.compile(r"\bParadise\b", re.I), "Paradise"),
    (re.compile(r"\bStoMPS\b", re.I), "Spa Frog"),
    (re.compile(r"\bLuther\s+Loon\b", re.I), "Marquis"),
    (re.compile(r"\bSpin\s+Lab\b", re.I), "Spin Lab"),
    (re.compile(r"\bEasy\s+Klip®?\b", re.I), "Easy Klip"),
    (re.compile(r"\bCoverMate\b", re.I), "Marquis"),
    (re.compile(r"\bFreestyle\s+Lift\b", re.I), "Marquis"),
    (re.compile(r"\bSafe-T\s+Rail\b", re.I), "Marquis"),
    (re.compile(r"Hydraulic\s+Cover\s+Lifter", re.I), "Marquis"),
    (re.compile(r"Filter\s+Flosser", re.I), "Filter Flosser"),
]


def detect_brand(description: str) -> Optional[str]:
    for pat, brand in BRAND_RULES:
        if pat.search(description):
            return brand
    return None


# Hand-curated product names for products where description bleeds into the auto-extracted name
# (typically because the source description has no clear name/description separator).
NAME_OVERRIDES: dict[str, str] = {
    "20010": "Paradise Spa Vacuum",
    "20015": "Serene Mineral Cartridge",
    "20016": "Serene Bromine Floating Sanitizer System",
    "20025": "Skimmer Net",
    "20026": "Marquis Oil Absorbing Floating Sponge",
    "20027": "Cover Lock Kit (4 pc)",
    "20035": "Hydraulic Cover Lifter",
    "20037": "Marquis Sponge Glove",
    "20042": "Marquis® Sig. Filter 2000-10 / Vector21 2023+ / Base Celebrity / Nashville Elite",
    "20150": "Serene Bromine Inline Start-up Kit",
    "20151": "Serene Bromine Floating Start-up Kit",
    "20198": "Serene Bromine 200 gram Cartridge",
    "20323": "Spa Frog Jump Start",
    "20497": "Large Rubber Floating Duck",
    "20630": "@ease Swim Spa Cartridge Kit",
    "20683": "@ease SmartChlor Cartridge Refill",
    "21259": "Marquis® Cover Companion",
    "23826": "Filter Flosser Cleaning Wand",
    "23854": "Spin Lab Test Disks (50 per box)",
}


def extract_short_name(description: str) -> str:
    """
    Pull a concise product name from the description.

    Priority order for cuts:
      1. First " - " separator (hyphen with spaces on either side) — the catalog's
         consistent convention for separating product name from description.
      2. First sentence-ending period (where period is followed by a capital letter
         starting a new sentence, not in a measurement abbreviation).
      3. Fall back to a 60-char cap (cut at last word boundary).

    Names are capped at 60 chars to be readable in compact list rows.
    """
    text = description.strip()

    # Measurement abbreviations that commonly terminate a product name (e.g. "16 oz.", "1.25lb.", "35 Sq. Ft.")
    unit_re = r"(?:oz|lb|lbs|gal|ml|gr|ft|sq|pc)"

    # Two tiers of candidate cuts.
    strong: list[int] = []
    weak: list[int] = []

    # Strong: " - " separator (or en/em dash with spaces)
    strong.extend(m.start() for m in re.finditer(r"\s+[-\u2010\u2013\u2014]\s+", text))

    # Strong: compound measurement "N Sq. Ft." — keep both units together
    for m in re.finditer(rf"\d\s*{unit_re}\.\s*{unit_re}\.", text, re.I):
        strong.append(m.end())

    # Strong: standalone measurement-period (e.g. "16 oz.", "1.25lb.", "5lb.", "1.5lb.Slow").
    # Skip this match if we're right before " Ft." (compound handled above).
    for m in re.finditer(rf"\d\s*{unit_re}\.", text, re.I):
        # Check if "Ft." follows within 3 chars — if so, this is part of a compound
        following = text[m.end():m.end() + 4]
        if re.match(r"\s*Ft\.", following, re.I):
            continue
        strong.append(m.end())

    # Strong: first comma when no " - " or measurement is present — it often marks
    # the end of a product name in descriptions like "Luther Loon, fun, floating...".
    # Only add the FIRST comma to strong cuts.
    comma_matches = list(re.finditer(r",\s+", text))
    if comma_matches:
        strong.append(comma_matches[0].start())

    # Weak: sentence-ending period followed by capital (space optional)
    for m in re.finditer(r"\.(?:\s+|)(?=[A-Z])", text):
        weak.append(m.start() + 1)

    # Weak: subsequent comma cuts
    weak.extend(m.start() for m in comma_matches[1:])

    strong = sorted(set(strong))
    weak = sorted(set(weak))

    def pick(candidates):
        usable = [c for c in candidates if 6 <= c <= 60]
        sweet = [c for c in usable if c >= 15]
        if sweet:
            return text[:min(sweet)].strip().rstrip(",;: -")
        if usable:
            return text[:min(usable)].strip().rstrip(",;: -")
        return None

    result = pick(strong)
    if result:
        return result

    result = pick(weak)
    if result:
        return result

    return _cap_length(text, 60)


def _cap_length(text: str, max_len: int) -> str:
    text = re.sub(r"[\s,;:\-\u2010]+$", "", text)
    if len(text) <= max_len:
        return text
    space = text.rfind(" ", 0, max_len)
    return (text[:space] if space > max_len // 2 else text[:max_len]).rstrip(",;: -")


def clean_description(description: str) -> str:
    """Light cleanup of the description kept in the UI — preserve facts, strip marketing filler."""
    text = description
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    # Remove trailing "(N/cs)" — case info is now a separate field
    text = re.sub(r"\s*\((?:\d+[^)]*?/cs|\d+\s*kits?\s*/\s*cs)\)\s*$", "", text, flags=re.I)
    # Strip common marketing phrases at start/end
    text = re.sub(r"\s*NEW\s+FOR\s+\d{4}!?\s*$", "", text, flags=re.I).strip()
    return text


# ------------------------- Categorization -------------------------

# Each category keyed by function(sku, section, description) -> bool. The first match wins.
# Order matters — overrides first, then broader rules.

def categorize(sku: str, section: str, desc_lower: str) -> str:
    # Spa Frog Balancers: the balancing basics kit + Trudose refills + pipe/jet cleaner
    if sku in {"23830", "23831", "23832", "23833", "23834", "23835", "23836", "23837"}:
        return "Spa Frog Balancers"

    # @ease Chlorine (entire PDF section) plus Jump Start and Maintain Shock
    if "@EASE" in section.upper():
        return "Spa Frog @ease Chlorine"
    if sku in {"20323", "20868"}:  # Jump Start, Maintain Shock — @ease ecosystem
        return "Spa Frog @ease Chlorine"

    # Serene Bromine: the rest of the Spa Frog section (US + EU/Canadian)
    if "Serene" in section or "EUROPEAN" in section.upper():
        return "Spa Frog Serene Bromine"

    # Marquis Chemicals: actual sanitizers and balancers (first 5 SKUs in Balancers MARQUIS)
    if "Sanitizers" in section and "MARQUIS" in section.upper():
        return "Marquis Chemicals"
    if sku in {"23802", "23803", "23863", "23814", "23815"}:
        return "Marquis Chemicals"

    # Cleaners & Protectants: 303 + all cleaners/enzymes mis-classed as Balancers in PDF
    cleaner_skus = {"23857", "23866", "23864", "23816", "23809", "23808", "23807",
                    "23817", "23818", "23819", "23806"}
    if sku in cleaner_skus:
        return "Cleaners & Protectants"

    # Tools & Accessories: vacuums, skimmers, sponges, test strips, measuring cups, filter flosser
    tool_skus = {"20010", "20025", "20026", "20037", "23826",  # from Balancers section
                 "23854", "23859", "20598", "20720"}  # Water Testing section
    if sku in tool_skus:
        return "Tools & Accessories"
    if "Water Testing" in section:
        return "Tools & Accessories"

    # Filter Cartridges: entire Filtration & Maintenance section
    if "Filtration" in section:
        return "Filter Cartridges"

    # Covers & Lifters: entire Cover Lifts/Locks section
    if "Cover" in section and "Lift" in section:
        return "Covers & Lifters"

    # Lifestyle
    if "MISCELLANEOUS" in section.upper() or sku in {"20319", "20694", "20498", "20724", "23822"}:
        return "Lifestyle"

    # Unhandled — flag for review
    return "Uncategorized"


CATEGORIES = [
    "Spa Frog Balancers",
    "Spa Frog Serene Bromine",
    "Spa Frog @ease Chlorine",
    "Marquis Chemicals",
    "Cleaners & Protectants",
    "Filter Cartridges",
    "Tools & Accessories",
    "Covers & Lifters",
    "Lifestyle",
]


# ------------------------- PDF walk -------------------------

def parse_pdf(pdf_path: Path) -> list[Product]:
    products: list[Product] = []
    current_section = ""
    skip_section = False  # when True, drop all products until the next section header
    with pdfplumber.open(pdf_path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            # Use find_tables so we get bboxes (positions); extract() returns the same cell content.
            for table in page.find_tables():
                rows_content = table.extract()
                row_objects = table.rows
                for row_idx, row in enumerate(rows_content):
                    if not row or len(row) < 5:
                        continue
                    col0 = (row[0] or "").strip()
                    col1 = (row[1] or "").strip()
                    col2 = row[2] or ""
                    col3 = (row[3] or "").strip()
                    col4 = (row[4] or "").strip()

                    # Section header row
                    if col0 and not col1:
                        header = normalize(col0)
                        if any(x in header for x in ("Item ID", "Combine", "Freight Pro", "Free Freight")):
                            continue
                        current_section = header
                        # Skip EU/Canadian products — Jeremy (US dealer) doesn't carry them.
                        skip_section = bool(
                            re.search(r"\b(EUROPEAN|CANADIAN|EU/)\b", header, re.I)
                        )
                        continue

                    # Product row
                    if col1.isdigit() and col2:
                        if skip_section:
                            continue
                        raw_desc = normalize(col2)
                        brand = detect_brand(raw_desc)
                        # Use manual override if present, else auto-extract
                        short = NAME_OVERRIDES.get(col1) or extract_short_name(raw_desc)
                        desc = clean_description(raw_desc)
                        case_size = extract_case_size(raw_desc)
                        individually = is_sold_individually(raw_desc)
                        unit: str = "each"
                        if case_size and case_size > 1 and not individually:
                            unit = "case"

                        cpu = parse_price(col3)
                        cp = parse_price(col4)

                        category = categorize(col1, current_section, raw_desc.lower())

                        # Row bbox: (x0, top, x1, bottom)
                        bbox = row_objects[row_idx].bbox if row_idx < len(row_objects) else None

                        products.append(Product(
                            sku=col1,
                            raw_section=current_section,
                            raw_description=raw_desc,
                            short_name=short,
                            brand=brand,
                            description=desc,
                            category=category,
                            cost_per_unit=cpu if cpu is not None else 0.0,
                            case_price=cp,
                            case_size=case_size,
                            unit=unit,
                            _page=page_idx,
                            _row_top=bbox[1] if bbox else None,
                            _row_bottom=bbox[3] if bbox else None,
                        ))
    return products


def extract_product_images(pdf_path: Path, products: list[Product]) -> None:
    """
    For each product row, find the best-matching image on the same page by vertical
    position, extract it, save to public/marquis-imgs/mq-<sku>.<ext>, and set
    product['image_path'] to the web path.

    Strategy:
      - Filter out tiny decorative glyphs (< 10pt wide or < 10pt tall in page display)
      - For each product row, pick the image whose vertical CENTER falls within the
        row's top/bottom range.
      - Extract image bytes with pypdf (which keeps pixel data); save as the original format.
    """
    IMG_DIR.mkdir(parents=True, exist_ok=True)

    # Group products by page
    by_page: dict[int, list[Product]] = {}
    for p in products:
        pg = p.get("_page")
        if pg is not None:
            by_page.setdefault(pg, []).append(p)

    # Open the PDF twice: pdfplumber for image positions, pypdf for raw image data
    pp = pdfplumber.open(pdf_path)
    py = PdfReader(pdf_path)

    for page_idx, prods in by_page.items():
        page_plumb = pp.pages[page_idx]
        page_py = py.pages[page_idx]

        # Get all images on this page with their positions (display points).
        # Product photos are typically 7-35 pt wide × 13-25 pt tall (chemistry bottles
        # are narrow-tall). Skip tiny ones that are likely just glyphs.
        image_positions = []
        for img in page_plumb.images:
            w, h = img["width"], img["height"]
            # Accept if: both dims >= 10, OR (height >= 13 AND width >= 7) — covers tall-narrow bottles
            size_ok = (w >= 10 and h >= 10) or (h >= 13 and w >= 7)
            if size_ok and 25 <= img["x0"] <= 100:
                image_positions.append({
                    "top": img["top"],
                    "bottom": img["bottom"],
                    "name": img.get("name"),
                    "width": w,
                    "height": h,
                })

        # Get raw image data from pypdf (pdfplumber uses "Im17", pypdf uses "Im17.jp2" —
        # index by the stem so lookup works both ways).
        pypdf_images = {}
        for i in page_py.images:
            pypdf_images[i.name] = i  # full name with extension
            stem = i.name.rsplit(".", 1)[0]
            pypdf_images[stem] = i  # also indexed without extension

        # First pass: strict overlap. Track which images get claimed.
        claimed: set[str] = set()

        def pick_image(top: float, bottom: float, slack: float = 0.0):
            """Return best image (and whether it's a near-miss) within top..bottom ± slack."""
            best_match = None
            best_score = -1.0
            for ip in image_positions:
                if ip["name"] in claimed:
                    continue
                overlap = max(0, min(bottom + slack, ip["bottom"]) - max(top - slack, ip["top"]))
                if overlap <= 0:
                    continue
                # Score: overlap bytes + small area bonus
                score = overlap * 10 + ip["width"] * ip["height"] / 1000
                if score > best_score:
                    best_score = score
                    best_match = ip
            return best_match

        # Pass 1: strict overlap
        for prod in prods:
            top = prod.get("_row_top")
            bottom = prod.get("_row_bottom")
            if top is None or bottom is None:
                continue
            match = pick_image(top, bottom, slack=0)
            if match:
                prod["_matched_image"] = match
                claimed.add(match["name"])

        # Pass 2: near-miss (within 12 pt)
        for prod in prods:
            if prod.get("_matched_image"):
                continue
            top = prod.get("_row_top")
            bottom = prod.get("_row_bottom")
            if top is None or bottom is None:
                continue
            match = pick_image(top, bottom, slack=12)
            if match:
                prod["_matched_image"] = match
                claimed.add(match["name"])

        # Pass 3: extract matched images to disk
        for prod in prods:
            best = prod.get("_matched_image")
            if not best:
                continue
            raw = pypdf_images.get(best["name"])
            if not raw:
                continue

            # Determine extension
            data = raw.data
            # Detect format from magic bytes
            ext = "jpg"
            if data[:3] == b"\xff\xd8\xff":
                ext = "jpg"
            elif data[:8] == b"\x89PNG\r\n\x1a\n":
                ext = "png"
            elif data[:4] == b"\x00\x00\x00\x0c" and data[4:8] == b"jP  ":
                # JP2 — PIL can convert to JPEG
                try:
                    im = Image.open(io.BytesIO(data))
                    if im.mode != "RGB":
                        im = im.convert("RGB")
                    out = io.BytesIO()
                    im.save(out, format="JPEG", quality=85)
                    data = out.getvalue()
                    ext = "jpg"
                except Exception:
                    ext = "jp2"
            else:
                # Unknown — try PIL
                try:
                    im = Image.open(io.BytesIO(data))
                    if im.mode != "RGB":
                        im = im.convert("RGB")
                    out = io.BytesIO()
                    im.save(out, format="JPEG", quality=85)
                    data = out.getvalue()
                    ext = "jpg"
                except Exception:
                    continue

            out_path = IMG_DIR / f"mq-{prod['sku']}.{ext}"
            out_path.write_bytes(data)
            prod["image_path"] = f"/marquis-imgs/mq-{prod['sku']}.{ext}"


# ------------------------- TypeScript generator -------------------------

def ts_string(s: str) -> str:
    """Emit a JS/TS string literal with proper escaping."""
    if s is None:
        return "undefined"
    # Prefer single quotes; escape backslashes, then single quotes.
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:40] or "item"


def product_id(sku: str, short: str) -> str:
    # Stable id: mq-<sku>-<slug>
    return f"mq-{sku}-{slugify(short)}"


def emit_ts(products: list[Product]) -> str:
    # Sort products by category (using CATEGORIES order), then SKU
    cat_order = {c: i for i, c in enumerate(CATEGORIES)}
    cat_order["Uncategorized"] = 9999
    products_sorted = sorted(products, key=lambda p: (cat_order.get(p["category"], 9999), p["sku"]))

    lines = [
        "// AUTO-GENERATED — do NOT edit by hand.",
        "// Edit the CSV/PDF in /docs and re-run `npm run import:marquis` (or `python scripts/import-marquis.py`).",
        "",
        "import { AccessoryVendor } from '@/types/accessories';",
        "",
        "export const marquisAccessories: AccessoryVendor = {",
        "  id: 'marquis-accessories',",
        "  name: 'Marquis',",
        "  orderEmail: 'insidesales@marquiscorp.com',",
        "  accountNumber: '101099',",
        "  defaultShippingPct: 10,",
        "  categories: [",
    ]
    for c in CATEGORIES:
        lines.append(f"    {ts_string(c)},")
    if any(p["category"] == "Uncategorized" for p in products):
        lines.append(f"    {ts_string('Uncategorized')},")
    lines.append("  ],")
    lines.append("  products: [")

    last_cat = None
    for p in products_sorted:
        if p["category"] != last_cat:
            lines.append("")
            lines.append(f"    // ------------------ {p['category']} ------------------")
            last_cat = p["category"]

        pid = product_id(p["sku"], p["short_name"])
        parts = [
            f"id: {ts_string(pid)}",
            f"name: {ts_string(p['short_name'])}",
            f"sku: {ts_string(p['sku'])}",
        ]
        if p.get("brand"):
            parts.append(f"brand: {ts_string(p['brand'])}")
        parts.append(f"category: {ts_string(p['category'])}")
        # Pricing: when unit='case', use case_price (UI convention: qty = # of cases, displayed as "$X/case").
        # When unit='each', use per-unit cost.
        is_case_packed = p["unit"] == "case" and p.get("case_price") is not None
        order_price = p["case_price"] if is_case_packed else p["cost_per_unit"]
        parts.append(f"price: {order_price:.2f}")
        parts.append(f"retailSource: {order_price:.2f}")
        parts.append(f"wholesale: {order_price:.2f}")
        parts.append(f"unit: {ts_string(p['unit'])}")
        if p.get("case_size"):
            parts.append(f"caseSize: {p['case_size']}")
        if p.get("image_path"):
            parts.append(f"imageUrl: {ts_string(p['image_path'])}")
        if p.get("description"):
            parts.append(f"description: {ts_string(p['description'])}")

        body = ",\n      ".join(parts)
        lines.append(f"    {{")
        lines.append(f"      {body},")
        lines.append("    },")

    lines.append("  ],")
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


# ------------------------- Main -------------------------

def main():
    if not PDF_PATH.exists():
        raise SystemExit(f"PDF not found: {PDF_PATH}")
    print(f"Parsing {PDF_PATH.name}...")
    products = parse_pdf(PDF_PATH)
    print(f"Parsed {len(products)} products.")

    # Extract product images (position-matched to rows)
    print("Extracting product images...")
    extract_product_images(PDF_PATH, products)
    with_img = sum(1 for p in products if p.get("image_path"))
    print(f"  Matched images: {with_img}/{len(products)}")

    # Category summary
    by_cat: dict[str, int] = {}
    for p in products:
        by_cat[p["category"]] = by_cat.get(p["category"], 0) + 1
    print("By category:")
    for c in CATEGORIES:
        if c in by_cat:
            print(f"  {c}: {by_cat[c]}")
    if by_cat.get("Uncategorized", 0) > 0:
        print(f"  ⚠  Uncategorized: {by_cat['Uncategorized']}")
        for p in products:
            if p["category"] == "Uncategorized":
                print(f"     - {p['sku']}: {p['short_name']}  (section: {p['raw_section']})")

    # Write intermediate JSON for inspection (strip internal position metadata)
    INTERMEDIATE_JSON.parent.mkdir(parents=True, exist_ok=True)
    clean_products = [
        {k: v for k, v in p.items() if not k.startswith("_")}
        for p in products
    ]
    with INTERMEDIATE_JSON.open("w", encoding="utf-8") as f:
        json.dump(clean_products, f, indent=2, ensure_ascii=False)
    print(f"Wrote {INTERMEDIATE_JSON.relative_to(ROOT)}")

    # Write TypeScript data file
    ts = emit_ts(products)
    OUT_TS.write_text(ts, encoding="utf-8")
    print(f"Wrote {OUT_TS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
