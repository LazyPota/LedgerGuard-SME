"""Decimal-backed domain records.

Every monetary value is ``Decimal`` quantized ROUND_HALF_EVEN to 2 places;
rates to 4 places. No float ever enters this module's type surface.
"""

from decimal import Decimal, InvalidOperation, ROUND_HALF_EVEN
from enum import Enum, IntEnum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CURRENCY_QUANT = Decimal("0.01")
RATE_QUANT = Decimal("0.0001")
QTY_QUANT = Decimal("0.0001")


def to_money(value: Any) -> Decimal:
    """Parse and quantize currency with banker's rounding."""
    try:
        parsed = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"invalid decimal amount: {value!r}") from exc
    if not parsed.is_finite():
        raise ValueError(f"non-finite decimal amount: {value!r}")
    return parsed.quantize(CURRENCY_QUANT, rounding=ROUND_HALF_EVEN)


def to_rate(value: Any) -> Decimal:
    try:
        parsed = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"invalid decimal rate: {value!r}") from exc
    if not parsed.is_finite():
        raise ValueError(f"non-finite decimal rate: {value!r}")
    return parsed.quantize(RATE_QUANT, rounding=ROUND_HALF_EVEN)


def to_qty(value: Any) -> Decimal:
    try:
        parsed = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"invalid decimal quantity: {value!r}") from exc
    if not parsed.is_finite():
        raise ValueError(f"non-finite decimal quantity: {value!r}")
    return parsed.quantize(QTY_QUANT, rounding=ROUND_HALF_EVEN)


class StrictModel(BaseModel):
    """Untrusted-input boundary: no extra keys, no coercion surprises."""

    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class PermissionTier(IntEnum):
    READ_ONLY = 0
    STAGE_SIMULATE = 1
    BOUNDED_AUTO_EXECUTE = 2
    HUMAN_IN_THE_LOOP = 3
    FORBIDDEN = 4


class InvoiceStatus(str, Enum):
    RECEIVED = "RECEIVED"
    EXTRACTED = "EXTRACTED"
    MATCHED = "MATCHED"
    PENDING_GRN_ATTESTATION = "PENDING_GRN_ATTESTATION"
    NEEDS_HUMAN_REVIEW = "NEEDS_HUMAN_REVIEW"
    QUARANTINED_DISCREPANCY = "QUARANTINED_DISCREPANCY"
    BLOCKED_DUPLICATE = "BLOCKED_DUPLICATE"
    SUSPECTED_SEMANTIC_DUPLICATE = "SUSPECTED_SEMANTIC_DUPLICATE"
    BLOCKED_BENEFICIARY_MISMATCH = "BLOCKED_BENEFICIARY_MISMATCH"
    READY_FOR_EXECUTION = "READY_FOR_EXECUTION"
    PAID = "PAID"


class MatchStatus(str, Enum):
    MATCHED = "MATCHED"
    MISMATCH = "MISMATCH"
    PENDING_GRN = "PENDING_GRN"


class RiskFlag(str, Enum):
    PROMPT_INJECTION_DETECTED = "PROMPT_INJECTION_DETECTED"
    LOW_EXTRACTION_CONFIDENCE = "LOW_EXTRACTION_CONFIDENCE"
    DUPLICATE_ARTIFACT_HASH = "DUPLICATE_ARTIFACT_HASH"
    DUPLICATE_CANONICAL_ID = "DUPLICATE_CANONICAL_ID"
    SUSPECTED_SEMANTIC_DUPLICATE = "SUSPECTED_SEMANTIC_DUPLICATE"
    BENEFICIARY_MISMATCH = "BENEFICIARY_MISMATCH"
    PRICE_TOLERANCE_EXCEEDED = "PRICE_TOLERANCE_EXCEEDED"
    QUANTITY_TOLERANCE_EXCEEDED = "QUANTITY_TOLERANCE_EXCEEDED"
    HEADER_MATH_MISMATCH = "HEADER_MATH_MISMATCH"
    LINE_MATH_MISMATCH = "LINE_MATH_MISMATCH"
    MISSING_PO_REFERENCE = "MISSING_PO_REFERENCE"
    MISSING_GRN = "MISSING_GRN"
    NEGATIVE_QUANTITY = "NEGATIVE_QUANTITY"
    UNVERIFIED_CURRENCY = "UNVERIFIED_CURRENCY"
    PAYROLL_RESERVE_BREACH = "PAYROLL_RESERVE_BREACH"
    TIER3_APPROVAL_REQUIRED = "TIER3_APPROVAL_REQUIRED"
    TIER2_DAILY_CAP_BREACH = "TIER2_DAILY_CAP_BREACH"
    IDEMPOTENT_REPLAY = "IDEMPOTENT_REPLAY"


Money = Annotated[Decimal, Field(description="Currency amount, 2dp ROUND_HALF_EVEN")]
Rate = Annotated[Decimal, Field(description="Rate, 4dp ROUND_HALF_EVEN")]
Quantity = Annotated[Decimal, Field(description="Quantity, 4dp ROUND_HALF_EVEN")]


def _money(value: Any) -> Decimal:
    return to_money(value)


class VendorMaster(StrictModel):
    vendor_id: str = Field(min_length=1, max_length=64)
    legal_name: str = Field(min_length=1, max_length=200)
    iban: str = Field(min_length=4, max_length=64)
    is_allowlisted: bool = True

    _iban = field_validator("iban", mode="before")(staticmethod(lambda v: str(v).replace(" ", "").upper()))

    @property
    def iban_last4(self) -> str:
        return self.iban[-4:]

    @property
    def masked_iban(self) -> str:
        return f"****{self.iban_last4}"


class PurchaseOrderLine(StrictModel):
    sku: str = Field(min_length=1, max_length=64)
    description: str = Field(min_length=1, max_length=500)
    unit_of_measure: str = Field(min_length=1, max_length=16)
    quantity_ordered: Quantity
    unit_price: Money

    _qty = field_validator("quantity_ordered", mode="before")(staticmethod(to_qty))
    _price = field_validator("unit_price", mode="before")(staticmethod(to_money))

    @field_validator("quantity_ordered")
    @classmethod
    def _qty_non_negative(cls, value: Decimal) -> Decimal:
        if value < 0:
            raise ValueError("quantity_ordered must be >= 0")
        return value


class PurchaseOrder(StrictModel):
    po_id: str = Field(min_length=1, max_length=64)
    vendor_id: str = Field(min_length=1, max_length=64)
    currency: str = Field(min_length=3, max_length=3)
    order_date: str = Field(default="1970-01-01", pattern=r"^\d{4}-\d{2}-\d{2}$")
    status: str = Field(default="OPEN_CONFIRMED", max_length=32)
    price_tolerance: Rate = Decimal("0.0000")
    lines: list[PurchaseOrderLine] = Field(min_length=1)

    _tol = field_validator("price_tolerance", mode="before")(staticmethod(to_rate))
    _currency = field_validator("currency", mode="before")(staticmethod(lambda v: str(v).upper()))

    @model_validator(mode="after")
    def _unique_skus(self) -> "PurchaseOrder":
        skus = [line.sku for line in self.lines]
        if len(skus) != len(set(skus)):
            raise ValueError("duplicate SKU in purchase order")
        return self

    @property
    def line_by_sku(self) -> dict[str, PurchaseOrderLine]:
        return {line.sku: line for line in self.lines}


class GRNLine(StrictModel):
    sku: str = Field(min_length=1, max_length=64)
    quantity_received: Quantity
    quantity_rejected: Quantity = Decimal("0.0000")

    _qty = field_validator("quantity_received", "quantity_rejected", mode="before")(staticmethod(to_qty))

    @field_validator("quantity_received", "quantity_rejected")
    @classmethod
    def _non_negative(cls, value: Decimal) -> Decimal:
        if value < 0:
            raise ValueError("GRN quantities must be >= 0")
        return value


class GoodsReceiptNote(StrictModel):
    grn_id: str = Field(min_length=1, max_length=64)
    po_id: str = Field(min_length=1, max_length=64)
    received_date: str = Field(default="1970-01-01", pattern=r"^\d{4}-\d{2}-\d{2}$")
    warehouse_verified_by: str = Field(default="", max_length=200)
    lines: list[GRNLine] = Field(min_length=1)

    @property
    def line_by_sku(self) -> dict[str, GRNLine]:
        return {line.sku: line for line in self.lines}


class CreditFacilityType(str, Enum):
    LOC = "LOC"
    SCF = "SCF"
    STL = "STL"


class CreditFacility(StrictModel):
    facility_id: str = Field(min_length=1, max_length=64)
    facility_type: CreditFacilityType
    facility_limit: Money
    current_drawn: Money = Decimal("0.00")
    annual_rate: Rate
    origination_fee_pct: Rate = Decimal("0.0000")
    min_current_ratio: Rate = Decimal("1.0000")
    requires_verified_payable: bool = True

    _money = field_validator(
        "facility_limit", "current_drawn", mode="before"
    )(staticmethod(to_money))
    _rates = field_validator(
        "annual_rate", "origination_fee_pct", "min_current_ratio", mode="before"
    )(staticmethod(to_rate))

    @property
    def available_headroom(self) -> Decimal:
        return (self.facility_limit - self.current_drawn).quantize(CURRENCY_QUANT)


class CashPosition(StrictModel):
    tenant_id: str = Field(min_length=1, max_length=64)
    as_of_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    available_cash: Money
    current_ratio: Rate = Decimal("1.0000")

    _cash = field_validator("available_cash", mode="before")(staticmethod(to_money))
    _ratio = field_validator("current_ratio", mode="before")(staticmethod(to_rate))


class ScheduledInflow(StrictModel):
    inflow_id: str = Field(min_length=1, max_length=64)
    day_offset: int = Field(ge=1, le=3650)
    amount: Money
    collection_haircut: Rate = Decimal("0.0000")
    description: str = Field(default="", max_length=200)

    _amount = field_validator("amount", mode="before")(staticmethod(to_money))
    _haircut = field_validator("collection_haircut", mode="before")(staticmethod(to_rate))


class FixedOutflow(StrictModel):
    outflow_id: str = Field(min_length=1, max_length=64)
    day_offset: int = Field(ge=1, le=3650)
    amount: Money
    category: str = Field(default="OPERATING", max_length=32)

    _amount = field_validator("amount", mode="before")(staticmethod(to_money))
