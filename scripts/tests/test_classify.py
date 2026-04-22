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
