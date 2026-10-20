from decimal import Decimal

from pydantic import ValidationError
import pytest

from backend.app.config import get_settings
from backend.app.schemas.domain import (
    GoodsReceiptNote,
    GRNLine,
    PurchaseOrder,
    PurchaseOrderLine,
    VendorMaster,
    to_money,
    to_rate,
)


def test_settings_default_to_offline_simulated_mode(monkeypatch):
    monkeypatch.delenv("OFFLINE_DETERMINISTIC_MODE", raising=False)
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.offline_deterministic_mode is True
    assert settings.execution_mode == "LOCAL_SIMULATED_LEDGER"
    assert settings.tier2_single_payment_cap == Decimal("2500.00")
    assert settings.tier2_daily_payment_cap == Decimal("5000.00")


def test_money_quantizes_half_even():
    assert to_money("2.675") == Decimal("2.68")
    assert to_money("2.665") == Decimal("2.66")
    assert to_money(Decimal("1")) == Decimal("1.00")


def test_rate_quantizes_to_four_places():
    assert to_rate("0.02") == Decimal("0.0200")
    assert to_rate("0.123456") == Decimal("0.1235")


def test_vendor_master_masks_iban():
    vendor = VendorMaster(
        vendor_id="vnd_001",
        legal_name="Shenzhen Precision Ltd",
        iban="CN00 1234 5678 4829",
        is_allowlisted=True,
    )
    assert vendor.iban_last4 == "4829"
    assert vendor.masked_iban == "****4829"


def test_domain_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        VendorMaster(
            vendor_id="vnd_001",
            legal_name="X",
            iban="CN001",
            is_allowlisted=True,
            evil="payload",
        )


def test_po_rejects_negative_quantity():
    with pytest.raises(ValidationError):
        PurchaseOrder(
            po_id="PO-1",
            vendor_id="vnd_001",
            currency="CNY",
            lines=[
                PurchaseOrderLine(
                    sku="SKU-1",
                    description="Widget",
                    unit_of_measure="EA",
                    quantity_ordered=Decimal("-1"),
                    unit_price=Decimal("10.00"),
                )
            ],
        )


def test_grn_line_and_po_line_are_decimal_backed():
    po = PurchaseOrder(
        po_id="PO-1",
        vendor_id="vnd_001",
        currency="CNY",
        lines=[
            PurchaseOrderLine(
                sku="SKU-1",
                description="Widget",
                unit_of_measure="BOX",
                quantity_ordered="10",
                unit_price="12.50",
            )
        ],
    )
    grn = GoodsReceiptNote(
        grn_id="GRN-1",
        po_id="PO-1",
        lines=[GRNLine(sku="SKU-1", quantity_received="10")],
    )
    assert isinstance(po.lines[0].quantity_ordered, Decimal)
    assert po.lines[0].unit_price == Decimal("12.50")
    assert isinstance(grn.lines[0].quantity_received, Decimal)
