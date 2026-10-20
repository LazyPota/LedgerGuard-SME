from datetime import date
from decimal import Decimal

from backend.app.engine.working_capital import (
    CashEvent,
    DiscountMetrics,
    discount_metrics,
    evaluate_liquidity,
    simulate_cash,
)
from backend.app.fixtures.benchmark import INVOICE_DOCUMENTS, extract_fixture


def _invoice(document_id: str):
    document = next(d for d in INVOICE_DOCUMENTS if d.document_id == document_id)
    return extract_fixture(document).invoice

START = date(2026, 11, 1)
INFLOWS = (
    CashEvent(day=3, amount=Decimal("5000.00"), label="AR inflow"),
    CashEvent(day=22, amount=Decimal("35000.00"), label="AR inflow"),
    CashEvent(day=26, amount=Decimal("2000.00"), label="AR inflow"),
)
OUTFLOWS = (
    CashEvent(day=3, amount=Decimal("2000.00"), label="Operating"),
    CashEvent(day=15, amount=Decimal("39200.00"), label="Payroll"),
    CashEvent(day=30, amount=Decimal("1800.00"), label="Month-end"),
)
FACILITY = {
    "facility_id": "LOC-WEBANK-SME-01",
    "facility_limit": Decimal("100000.00"),
    "current_drawn": Decimal("35000.00"),
    "annual_rate": Decimal("0.1050"),
    "origination_fee_pct": Decimal("0.0000"),
    "min_current_ratio": Decimal("1.2500"),
    "current_ratio": Decimal("1.4200"),
}


def test_discount_math_matches_2_10_net_30():
    metrics = discount_metrics(
        Decimal("40000.00"), Decimal("2.00"), discount_days=10, net_days=30
    )
    assert metrics.discounted_amount == Decimal("39200.00")
    assert metrics.gross_savings == Decimal("800.00")
    assert metrics.apr_pct == Decimal("37.24")
    assert metrics.ear_pct == Decimal("44.59")


def test_zero_discount_is_inert():
    metrics = discount_metrics(
        Decimal("1800.00"), Decimal("0.00"), discount_days=0, net_days=21
    )
    assert metrics.discounted_amount == Decimal("1800.00")
    assert metrics.gross_savings == Decimal("0.00")
    assert metrics.apr_pct == Decimal("0.00")
    assert metrics.ear_pct == Decimal("0.00")


def test_simulation_flags_payroll_floor_breach():
    result = simulate_cash(
        start_date=START,
        starting_cash=Decimal("77200.00"),
        payroll_floor=Decimal("50000.00"),
        inflows=INFLOWS,
        outflows=OUTFLOWS,
        payments=(),
        horizon_days=30,
    )
    assert result.min_cash == Decimal("41000.00")
    assert result.respects_floor is False
    assert len(result.points) == 30
    assert result.points[14].date == "2026-11-15"
    assert result.points[14].baseline_cash == Decimal("41000.00")


def test_inv101_requires_credit_bridge_and_stays_above_floor():
    outcome = extract_fixture(next(d for d in __import__("backend.app.fixtures.benchmark", fromlist=["INVOICE_DOCUMENTS"]).INVOICE_DOCUMENTS if d.document_id == "INV-2026-101"))
    decision = evaluate_liquidity(
        invoice=outcome.invoice,
        match_status="VERIFIED_ELIGIBLE",
        start_date=START,
        starting_cash=Decimal("77200.00"),
        payroll_floor=Decimal("50000.00"),
        inflows=INFLOWS,
        outflows=OUTFLOWS,
        facility=FACILITY,
    )
    assert decision.recommended_strategy == "CAPTURE_EARLY_DISCOUNT_WITH_CREDIT_BRIDGE"
    assert decision.gross_discount_amount == Decimal("800.00")
    assert decision.requires_credit_bridge is True
    assert decision.matched_credit_facility_id == "LOC-WEBANK-SME-01"
    assert decision.bridge_draw_amount == Decimal("48200.00")
    assert decision.respects_payroll_floor is True
    assert decision.net_economic_benefit == Decimal("800.00") - decision.bridge_interest_and_fee_cost
    assert decision.net_economic_benefit > 0


def test_payroll_floor_is_respected_with_bridge():
    result = simulate_cash(
        start_date=START,
        starting_cash=Decimal("77200.00"),
        payroll_floor=Decimal("50000.00"),
        inflows=INFLOWS,
        outflows=OUTFLOWS,
        payments=(CashEvent(day=10, amount=Decimal("39200.00"), label="Early pay"),),
        bridge_amount=Decimal("48200.00"),
        bridge_day=10,
        bridge_rate=Decimal("0.1050"),
        horizon_days=30,
    )
    assert result.min_cash >= Decimal("50000.00")
    assert result.respects_floor is True


def test_self_funded_when_cash_never_breaches_floor():
    decision = evaluate_liquidity(
        invoice=_invoice("INV-2026-101"),
        match_status="VERIFIED_ELIGIBLE",
        start_date=START,
        starting_cash=Decimal("277200.00"),
        payroll_floor=Decimal("50000.00"),
        inflows=INFLOWS,
        outflows=OUTFLOWS,
        facility=FACILITY,
    )
    assert decision.recommended_strategy == "CAPTURE_EARLY_DISCOUNT_SELF_FUNDED"
    assert decision.requires_credit_bridge is False
    assert decision.net_economic_benefit == Decimal("800.00")


def test_discount_deferred_when_bridge_cost_exceeds_savings():
    decision = evaluate_liquidity(
        invoice=_invoice("INV-2026-101"),
        match_status="VERIFIED_ELIGIBLE",
        start_date=START,
        starting_cash=Decimal("77200.00"),
        payroll_floor=Decimal("50000.00"),
        inflows=INFLOWS,
        outflows=OUTFLOWS,
        facility={**FACILITY, "annual_rate": Decimal("3.0000")},
    )
    assert decision.recommended_strategy == "DEFER_TO_NET_DUE_DATE"
    assert decision.net_economic_benefit == Decimal("0.00")


def test_no_discount_invoice_defers():
    outcome = extract_fixture(next(d for d in __import__("backend.app.fixtures.benchmark", fromlist=["INVOICE_DOCUMENTS"]).INVOICE_DOCUMENTS if d.document_id == "INV-2026-105"))
    decision = evaluate_liquidity(
        invoice=outcome.invoice,
        match_status="VERIFIED_ELIGIBLE",
        start_date=START,
        starting_cash=Decimal("77200.00"),
        payroll_floor=Decimal("50000.00"),
        inflows=INFLOWS,
        outflows=OUTFLOWS,
        facility=FACILITY,
    )
    assert decision.recommended_strategy == "DEFER_TO_NET_DUE_DATE"
    assert decision.selected_payment_date == "2026-11-30"


def test_quarantined_invoice_is_held():
    outcome = extract_fixture(next(d for d in __import__("backend.app.fixtures.benchmark", fromlist=["INVOICE_DOCUMENTS"]).INVOICE_DOCUMENTS if d.document_id == "INV-2026-102"))
    decision = evaluate_liquidity(
        invoice=outcome.invoice,
        match_status="QUARANTINED_DISCREPANCY",
        start_date=START,
        starting_cash=Decimal("77200.00"),
        payroll_floor=Decimal("50000.00"),
        inflows=INFLOWS,
        outflows=OUTFLOWS,
        facility=FACILITY,
    )
    assert decision.recommended_strategy == "HOLD_QUARANTINED"
    assert decision.requires_credit_bridge is False


def test_facility_covenant_breach_forces_deferral():
    decision = evaluate_liquidity(
        invoice=_invoice("INV-2026-101"),
        match_status="VERIFIED_ELIGIBLE",
        start_date=START,
        starting_cash=Decimal("77200.00"),
        payroll_floor=Decimal("50000.00"),
        inflows=INFLOWS,
        outflows=OUTFLOWS,
        facility={**FACILITY, "current_ratio": Decimal("1.1000")},
    )
    assert decision.recommended_strategy == "DEFER_TO_NET_DUE_DATE"
    assert decision.matched_credit_facility_id is None
