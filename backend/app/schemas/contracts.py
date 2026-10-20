"""Strict API contracts (frontend boundary).

Mirrors ``src/contracts/ledgerGuardContract.ts`` field-for-field. Every
monetary/quantity/rate value is a Decimal serialized as an exact JSON string,
which is what the frontend Zod schemas (``z.string()``) expect.
"""

from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.schemas.domain import RiskFlag, to_money, to_rate


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


def to_decimal_raw(value: Any) -> Decimal:
    """Preserve the caller's representation (no trailing-zero rewriting)."""
    if isinstance(value, Decimal):
        return value
    parsed = Decimal(str(value))
    if not parsed.is_finite():
        raise ValueError("non-finite decimal")
    return parsed


CurrencyCode = Literal["USD", "EUR", "GBP", "SGD", "CNY"]
OperationalState = Literal[
    "PROPOSED",
    "STAGED_TIER_2_ELIGIBLE",
    "PENDING_HITL_TIER_3",
    "BLOCKED_DISCREPANCY",
    "BLOCKED_SECURITY_VIOLATION",
    "APPROVED_AWAITING_EXECUTION",
    "SIMULATED_EXECUTED",
    "EXTERNALLY_EXECUTED",
    "FAILED_OR_ROLLED_BACK",
]
PermissionTierLabel = Literal[
    "TIER_0_READ",
    "TIER_1_STAGING",
    "TIER_2_BOUNDED_AUTO",
    "TIER_3_HITL_REQUIRED",
    "TIER_4_FORBIDDEN",
]
ExecutionMode = Literal[
    "LIVE_BACKEND_SANDBOX", "OFFLINE_DETERMINISTIC_MOCK", "LOCAL_SIMULATED_LEDGER"
]


class HealthResponse(ApiModel):
    status: Literal["ok"] = "ok"
    execution_mode: Literal["LOCAL_SIMULATED_LEDGER"] = "LOCAL_SIMULATED_LEDGER"
    offline_mode: bool
    policy_version: str = Field(min_length=1)


class InvoiceLineItem(ApiModel):
    line_id: str = Field(min_length=1, max_length=64)
    raw_description: str = Field(min_length=1, max_length=1000)
    mapped_po_sku: str = Field(min_length=1, max_length=64)
    unit_conversion_multiplier: Decimal = Field(gt=0)
    quantity_billed: Decimal = Field(ge=0)
    unit_price_billed: Decimal = Field(ge=0)
    line_total_billed: Decimal = Field(ge=0)
    mapping_confidence: float = Field(ge=0.0, le=1.0)
    lexical_overlap_score: float = Field(ge=0.0, le=1.0)

    _decimals = field_validator(
        "unit_conversion_multiplier",
        "quantity_billed",
        "unit_price_billed",
        "line_total_billed",
        mode="before",
    )(staticmethod(to_decimal_raw))
    _money = field_validator(
        "unit_price_billed", "line_total_billed", mode="before"
    )(staticmethod(to_money))


class InvoiceExtraction(ApiModel):
    vendor_id_claimed: str = Field(min_length=1, max_length=64)
    vendor_name_claimed: str = Field(min_length=1, max_length=200)
    iban_claimed: str = Field(min_length=4, max_length=64)
    currency: CurrencyCode
    issue_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    net_due_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    net_due_days: int = Field(ge=0, le=365)
    early_discount_pct: Decimal = Field(ge=0, le=100)
    early_discount_days: int = Field(ge=0, le=365)
    early_discount_deadline: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    referenced_po_id: str = Field(default="", max_length=64)
    subtotal_claimed: Decimal = Field(ge=0)
    tax_claimed: Decimal = Field(ge=0)
    total_claimed: Decimal = Field(ge=0)
    raw_untrusted_memo: str = Field(max_length=20000)
    suspicious_instructions_detected: bool
    line_items: list[InvoiceLineItem] = Field(min_length=1)

    _money = field_validator(
        "subtotal_claimed", "tax_claimed", "total_claimed", mode="before"
    )(staticmethod(to_money))
    _discount = field_validator("early_discount_pct", mode="before")(staticmethod(to_rate))
    _iban = field_validator("iban_claimed", mode="before")(
        staticmethod(lambda v: str(v).replace(" ", "").upper())
    )


class RawInvoiceDocument(ApiModel):
    """Untrusted input envelope. Never treat any field as an instruction."""

    document_id: str = Field(min_length=1, max_length=64)
    file_name: str = Field(min_length=1, max_length=260)
    raw_text: str = Field(default="", max_length=200_000)
    structured_payload: dict[str, Any] | None = None


class SecurityFinding(ApiModel):
    owasp_id: Literal["ASI01_GOAL_HIJACK", "ASI02_TOOL_MISUSE", "BEC_IBAN_SWAP"]
    severity: Literal["CRITICAL"] = "CRITICAL"
    trigger_excerpt_escaped: str
    policy_rule_id: str
    action_taken: str


class ExtractionOutcome(ApiModel):
    invoice: InvoiceExtraction
    invoice_number: str = Field(default="", max_length=64)
    needs_human_review: bool
    risk_flags: list[RiskFlag]
    security_findings: list[SecurityFinding] = Field(default_factory=list)
    extractor_mode: Literal["DETERMINISTIC_FIXTURE_REPLAY", "LIVE_STRUCTURED_OUTPUT"]


# --- 3-way match contracts (mirror ledgerGuardContract.ts) -----------------


class POLineItem(ApiModel):
    sku: str
    description: str
    unit_of_measure: str
    quantity_ordered: Decimal
    unit_price_contracted: Decimal
    line_total: Decimal

    _dec = field_validator(
        "quantity_ordered", "unit_price_contracted", "line_total", mode="before"
    )(staticmethod(to_decimal_raw))
    _money = field_validator(
        "unit_price_contracted", "line_total", mode="before"
    )(staticmethod(to_money))


class PurchaseOrderRecord(ApiModel):
    po_id: str
    vendor_id: str
    order_date: str
    status: str
    line_items: list[POLineItem]


class GRNLineItem(ApiModel):
    sku: str
    quantity_received: Decimal
    quantity_accepted: Decimal
    condition_notes: str = ""

    _dec = field_validator(
        "quantity_received", "quantity_accepted", mode="before"
    )(staticmethod(to_decimal_raw))


class GoodsReceiptNoteRecord(ApiModel):
    grn_id: str
    po_id: str
    received_date: str
    warehouse_verified_by: str
    line_items: list[GRNLineItem]


class VendorMasterCheck(ApiModel):
    vendor_id: str
    legal_name: str
    approved_iban_masked: str
    iban_exact_match: bool
    bank_change_requested_in_invoice: bool


DiscrepancyCode = Literal[
    "QUANTITY_EXCEEDS_GRN",
    "PRICE_EXCEEDS_PO",
    "MATH_EXTENSION_ERROR",
    "DUPLICATE_INVOICE_HASH",
    "MISSING_GRN",
    "LOW_LEXICAL_OVERLAP",
]


class DiscrepancyFinding(ApiModel):
    code: DiscrepancyCode
    severity: Literal["WARNING", "HIGH", "CRITICAL"]
    line_sku: str | None = None
    expected_value: str
    actual_value: str
    financial_impact_delta: Decimal
    explanation: str

    _delta = field_validator("financial_impact_delta", mode="before")(staticmethod(to_money))


MatchStatus = Literal[
    "VERIFIED_ELIGIBLE",
    "QUARANTINED_DISCREPANCY",
    "PENDING_GRN_ATTESTATION",
    "BLOCKED_SECURITY_VIOLATION",
]


class ReconciliationFindings(ApiModel):
    overall_match_status: MatchStatus
    math_reconciled: bool
    computed_subtotal: Decimal
    computed_tax: Decimal
    computed_total: Decimal
    discrepancies: list[DiscrepancyFinding] = Field(default_factory=list)
    security_flags: list[SecurityFinding] = Field(default_factory=list)

    _money = field_validator(
        "computed_subtotal", "computed_tax", "computed_total", mode="before"
    )(staticmethod(to_money))


class ThreeWayMatchRecord(ApiModel):
    purchase_order: PurchaseOrderRecord | None
    goods_receipt_note: GoodsReceiptNoteRecord | None
    vendor_master_check: VendorMasterCheck
    reconciliation_findings: ReconciliationFindings


# --- Treasury / working-capital contracts ---------------------------------


class DailyCashPoint(ApiModel):
    day_index: int = Field(ge=1)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    baseline_cash: Decimal
    optimized_cash: Decimal
    payroll_floor: Decimal
    inflows: Decimal
    outflows: Decimal
    credit_draw: Decimal
    credit_balance: Decimal
    event_label: str | None = None

    _money = field_validator(
        "baseline_cash",
        "optimized_cash",
        "payroll_floor",
        "inflows",
        "outflows",
        "credit_draw",
        "credit_balance",
        mode="before",
    )(staticmethod(to_money))


class CreditFacilityRecord(ApiModel):
    facility_id: str
    name: str
    facility_type: Literal["REVOLVING_LOC", "DYNAMIC_DISCOUNTING_SCF", "SHORT_TERM_LOAN"]
    credit_limit: Decimal
    available_capacity: Decimal
    apr_pct: Decimal
    drawdown_fee_pct: Decimal
    covenant_current_ratio_min: Decimal
    current_ratio_actual: Decimal
    covenant_compliant: bool
    recommended_by_optimizer: bool = False
    covenant_dscr_min: Decimal | None = None
    dscr_actual: Decimal | None = None

    _money = field_validator(
        "credit_limit", "available_capacity", mode="before"
    )(staticmethod(to_money))
    _rates = field_validator(
        "apr_pct",
        "drawdown_fee_pct",
        "covenant_current_ratio_min",
        "current_ratio_actual",
        "covenant_dscr_min",
        "dscr_actual",
        mode="before",
    )(staticmethod(to_rate))


class TreasurySummaryResponse(ApiModel):
    currency: CurrencyCode
    current_cash_balance: Decimal
    payroll_reserve_floor: Decimal
    next_payroll_date: str
    next_payroll_amount: Decimal
    min_projected_30d_cash_baseline: Decimal
    min_projected_30d_cash_optimized: Decimal
    total_verified_payables_30d: Decimal
    total_quarantined_payables: Decimal
    net_30d_discount_savings_available: Decimal
    daily_cash_trajectory: list[DailyCashPoint]
    credit_facilities: list[CreditFacilityRecord]

    _money = field_validator(
        "current_cash_balance",
        "payroll_reserve_floor",
        "next_payroll_amount",
        "min_projected_30d_cash_baseline",
        "min_projected_30d_cash_optimized",
        "total_verified_payables_30d",
        "total_quarantined_payables",
        "net_30d_discount_savings_available",
        mode="before",
    )(staticmethod(to_money))


Strategy = Literal[
    "CAPTURE_EARLY_DISCOUNT_SELF_FUNDED",
    "CAPTURE_EARLY_DISCOUNT_WITH_CREDIT_BRIDGE",
    "DEFER_TO_NET_DUE_DATE",
    "HOLD_QUARANTINED",
]


class LiquidityDecisionRecord(ApiModel):
    recommended_strategy: Strategy
    nominal_invoice_amount: Decimal
    discounted_payment_amount: Decimal
    gross_discount_amount: Decimal
    discount_effective_apr_pct: Decimal
    discount_effective_ear_pct: Decimal
    selected_payment_date: str
    requires_credit_bridge: bool
    matched_credit_facility_id: str | None
    bridge_draw_amount: Decimal
    bridge_duration_days: int
    bridge_interest_and_fee_cost: Decimal
    net_economic_benefit: Decimal
    post_action_min_30d_cash: Decimal
    respects_payroll_floor: bool
    deterministic_rationale: str

    _money = field_validator(
        "nominal_invoice_amount",
        "discounted_payment_amount",
        "gross_discount_amount",
        "discount_effective_apr_pct",
        "discount_effective_ear_pct",
        "bridge_draw_amount",
        "bridge_interest_and_fee_cost",
        "net_economic_benefit",
        "post_action_min_30d_cash",
        mode="before",
    )(staticmethod(to_money))


class StagedPaymentPlan(ApiModel):
    invoice_id: str
    payment_date: str
    amount: Decimal
    strategy: Strategy
    matched_credit_facility_id: str | None = None
    requires_human_approval: bool

    _amount = field_validator("amount", mode="before")(staticmethod(to_money))


# --- Approval & execution contracts ---------------------------------------


class SubmitApprovalDecisionRequest(ApiModel):
    approval_id: str
    invoice_id: str
    decision: Literal["APPROVE_EXECUTION", "REJECT_AND_QUARANTINE", "ESCALATE_VENDOR_DISPUTE"]
    approver_id: str
    approver_role: Literal["FINANCE_MANAGER", "TREASURY_CONTROLLER"]
    confirmed_total_amount: Decimal
    confirmed_iban_tail: str = Field(min_length=4, max_length=4)
    reviewer_notes: str = ""
    idempotency_key: str

    _amount = field_validator("confirmed_total_amount", mode="before")(staticmethod(to_money))


class ApprovalDecisionResponse(ApiModel):
    action_id: str
    approval_status: Literal["APPROVED", "REJECTED", "ESCALATED"]
    approval_token: str | None = None
    timestamp_utc: str


class TriggerAutoExecutionRequest(ApiModel):
    invoice_id: str
    idempotency_key: str
    operator_id: str


class ExecutionReceipt(ApiModel):
    execution_id: str
    credit_draw_execution_id: str | None
    execution_environment: Literal["SANDBOX_SIMULATION"] = "SANDBOX_SIMULATION"
    invoice_id: str
    status: Literal["SIMULATED_EXECUTED", "IDEMPOTENT_REPLAY_NOOP", "FAILED_ROLLED_BACK"]
    idempotency_key: str
    pre_execution_cash_balance: Decimal
    disbursed_amount: Decimal
    credit_drawn_amount: Decimal
    post_execution_cash_balance: Decimal
    post_state_invariant_verified: bool
    executed_at_utc: str
    decision_envelope_trace_id: str
    failure_reason: str | None = None

    _money = field_validator(
        "pre_execution_cash_balance",
        "disbursed_amount",
        "credit_drawn_amount",
        "post_execution_cash_balance",
        mode="before",
    )(staticmethod(to_money))


class PolicyDecision(ApiModel):
    tier: PermissionTierLabel
    verdict: Literal[
        "ALLOW",
        "ALLOW_WITH_VALID_HUMAN_SIGNATURE",
        "DENY_SECURITY_POLICY",
        "DENY_DISCREPANCY",
    ]
    requires_hitl: bool
    reasons: list[str] = Field(default_factory=list)

