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
