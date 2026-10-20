"""Deterministic working-capital math.

Trade-discount APR/EAR, 30-day cash projection with a hard payroll-reserve
floor, and constrained financing selection. No floats touch money.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_EVEN
from typing import Mapping, Sequence

from backend.app.schemas.contracts import (
    DailyCashPoint,
    InvoiceExtraction,
    LiquidityDecisionRecord,
)
from backend.app.schemas.domain import to_money

_ONE = Decimal("1")
_CENT = Decimal("0.01")


def _q2(value: Decimal) -> Decimal:
    return value.quantize(_CENT, rounding=ROUND_HALF_EVEN)


def _q4(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_EVEN)


@dataclass(frozen=True)
class CashEvent:
    day: int
    amount: Decimal
    label: str = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "amount", _q2(Decimal(self.amount)))


@dataclass(frozen=True)
class DiscountMetrics:
    discounted_amount: Decimal
    gross_savings: Decimal
    apr_pct: Decimal
    ear_pct: Decimal


@dataclass(frozen=True)
class SimulationResult:
    points: list[DailyCashPoint]
    min_cash: Decimal
    respects_floor: bool


def discount_metrics(
    nominal: Decimal, discount_pct: Decimal, *, discount_days: int, net_days: int
) -> DiscountMetrics:
    """d is given in percent (2.00 means 2%), matching the API contract."""
    nominal = to_money(nominal)
    d = _q4(discount_pct / Decimal("100"))
    if d <= 0 or discount_days <= 0 or net_days <= discount_days:
        return DiscountMetrics(nominal, Decimal("0.00"), Decimal("0.00"), Decimal("0.00"))

    discounted = _q2(nominal * (_ONE - d))
    savings = _q2(nominal - discounted)
    period = Decimal(net_days - discount_days)
    ratio = d / (_ONE - d)
    apr = (ratio * Decimal("365") / period * Decimal("100")).quantize(
        _CENT, rounding=ROUND_HALF_EVEN
    )
    ear = (((_ONE + ratio) ** (Decimal("365") / period)) - _ONE) * Decimal("100")
    ear = ear.quantize(_CENT, rounding=ROUND_HALF_EVEN)
    return DiscountMetrics(discounted, savings, apr, ear)


def simulate_cash(
    *,
    start_date: date,
    starting_cash: Decimal,
    payroll_floor: Decimal,
    inflows: Sequence[CashEvent],
    outflows: Sequence[CashEvent],
    payments: Sequence[CashEvent],
    bridge_amount: Decimal = Decimal("0.00"),
    bridge_day: int | None = None,
    bridge_rate: Decimal = Decimal("0.0000"),
    horizon_days: int = 30,
) -> SimulationResult:
    starting_cash = to_money(starting_cash)
    payroll_floor = to_money(payroll_floor)
    bridge_amount = to_money(bridge_amount)

    day_inflows: dict[int, Decimal] = {}
    day_outflows: dict[int, Decimal] = {}
    for event in inflows:
        day_inflows[event.day] = day_inflows.get(event.day, Decimal("0.00")) + event.amount
    for event in outflows:
        day_outflows[event.day] = day_outflows.get(event.day, Decimal("0.00")) + event.amount
    for event in payments:
        day_outflows[event.day] = day_outflows.get(event.day, Decimal("0.00")) + event.amount

    bridge_cost = Decimal("0.00")
    if bridge_amount > 0 and bridge_day is not None:
        remaining = horizon_days - bridge_day + 1
        bridge_cost = _q2(bridge_amount * bridge_rate * Decimal(remaining) / Decimal("365"))
        day_outflows[horizon_days] = day_outflows.get(horizon_days, Decimal("0.00")) + bridge_cost

    # Baseline: same fixed flows, no proposed payments, no bridge.
    baseline_cash = starting_cash
    optimized_cash = starting_cash
    points: list[DailyCashPoint] = []
    min_cash = starting_cash
    for day in range(1, horizon_days + 1):
        baseline_cash += day_inflows.get(day, Decimal("0.00"))
        baseline_cash -= sum(
            (e.amount for e in outflows if e.day == day), Decimal("0.00")
        )
        baseline_cash = _q2(baseline_cash)

        optimized_cash += day_inflows.get(day, Decimal("0.00"))
        optimized_cash -= day_outflows.get(day, Decimal("0.00"))
        if bridge_amount > 0 and bridge_day is not None and day >= bridge_day:
            optimized_cash += bridge_amount if day == bridge_day else Decimal("0.00")
        optimized_cash = _q2(optimized_cash)

        min_cash = min(min_cash, optimized_cash)
        label_bits = [e.label for e in outflows if e.day == day and e.label]
        label_bits += [e.label for e in payments if e.day == day and e.label]
        label_bits += [e.label for e in inflows if e.day == day and e.label]
        points.append(
            DailyCashPoint(
                day_index=day,
                date=(start_date + timedelta(days=day - 1)).isoformat(),
                baseline_cash=baseline_cash,
                optimized_cash=optimized_cash,
                payroll_floor=payroll_floor,
                inflows=_q2(day_inflows.get(day, Decimal("0.00"))),
                outflows=_q2(day_outflows.get(day, Decimal("0.00"))),
                credit_draw=bridge_amount if bridge_day == day else Decimal("0.00"),
                credit_balance=bridge_amount if bridge_day is not None and day >= bridge_day else Decimal("0.00"),
                event_label=", ".join(label_bits) or None,
            )
        )

    return SimulationResult(
        points=points,
        min_cash=_q2(min_cash),
        respects_floor=min_cash >= payroll_floor,
    )


def _decision(
    *,
    strategy: str,
    invoice: InvoiceExtraction,
    discounted: Decimal,
    gross: Decimal,
    apr: Decimal,
    ear: Decimal,
    payment_date: str,
    requires_bridge: bool,
    facility_id: str | None,
    draw: Decimal,
    duration: int,
    cost: Decimal,
    net: Decimal,
    min_cash: Decimal,
    respects_floor: bool,
    rationale: str,
) -> LiquidityDecisionRecord:
    return LiquidityDecisionRecord(
        recommended_strategy=strategy,
        nominal_invoice_amount=to_money(invoice.total_claimed),
        discounted_payment_amount=discounted,
        gross_discount_amount=gross,
        discount_effective_apr_pct=apr,
        discount_effective_ear_pct=ear,
        selected_payment_date=payment_date,
        requires_credit_bridge=requires_bridge,
        matched_credit_facility_id=facility_id,
        bridge_draw_amount=draw,
        bridge_duration_days=duration,
        bridge_interest_and_fee_cost=cost,
        net_economic_benefit=net,
        post_action_min_30d_cash=min_cash,
        respects_payroll_floor=respects_floor,
        deterministic_rationale=rationale,
    )


def evaluate_liquidity(
    *,
    invoice: InvoiceExtraction,
    match_status: str,
    start_date: date,
    starting_cash: Decimal,
    payroll_floor: Decimal,
    inflows: Sequence[CashEvent],
    outflows: Sequence[CashEvent],
    facility: Mapping[str, object] | None,
    horizon_days: int = 30,
) -> LiquidityDecisionRecord:
    baseline = simulate_cash(
        start_date=start_date,
        starting_cash=starting_cash,
        payroll_floor=payroll_floor,
        inflows=inflows,
        outflows=outflows,
        payments=(),
        horizon_days=horizon_days,
    )
    nominal = to_money(invoice.total_claimed)

    if match_status != "VERIFIED_ELIGIBLE":
        return _decision(
            strategy="HOLD_QUARANTINED",
            invoice=invoice,
            discounted=nominal,
            gross=Decimal("0.00"),
            apr=Decimal("0.00"),
            ear=Decimal("0.00"),
            payment_date=invoice.net_due_date,
            requires_bridge=False,
            facility_id=None,
            draw=Decimal("0.00"),
            duration=0,
            cost=Decimal("0.00"),
            net=Decimal("0.00"),
            min_cash=baseline.min_cash,
            respects_floor=baseline.respects_floor,
            rationale=(
                "Execution quarantined: reconciliation is not VERIFIED_ELIGIBLE. "
                "No payment or financing may be staged."
            ),
        )

    metrics = discount_metrics(
        nominal,
        invoice.early_discount_pct,
        discount_days=invoice.early_discount_days,
        net_days=invoice.net_due_days,
    )
    if metrics.gross_savings <= 0:
        return _decision(
            strategy="DEFER_TO_NET_DUE_DATE",
            invoice=invoice,
            discounted=nominal,
            gross=Decimal("0.00"),
            apr=Decimal("0.00"),
            ear=Decimal("0.00"),
            payment_date=invoice.net_due_date,
            requires_bridge=False,
            facility_id=None,
            draw=Decimal("0.00"),
            duration=0,
            cost=Decimal("0.00"),
            net=Decimal("0.00"),
            min_cash=baseline.min_cash,
            respects_floor=baseline.respects_floor,
            rationale="No early-payment discount offered; pay at net due date.",
        )

    if invoice.early_discount_deadline:
        deadline_date = date.fromisoformat(invoice.early_discount_deadline)
    else:
        deadline_date = date.fromisoformat(invoice.issue_date) + timedelta(days=invoice.early_discount_days)
    pay_day = min(max((deadline_date - start_date).days + 1, 1), horizon_days)
    payment = CashEvent(
        day=pay_day, amount=metrics.discounted_amount, label="Early Pay"
    )

    self_funded = simulate_cash(
        start_date=start_date,
        starting_cash=starting_cash,
        payroll_floor=payroll_floor,
        inflows=inflows,
        outflows=outflows,
        payments=(payment,),
        horizon_days=horizon_days,
    )
    if self_funded.respects_floor:
        return _decision(
            strategy="CAPTURE_EARLY_DISCOUNT_SELF_FUNDED",
            invoice=invoice,
            discounted=metrics.discounted_amount,
            gross=metrics.gross_savings,
            apr=metrics.apr_pct,
            ear=metrics.ear_pct,
            payment_date=deadline_date.isoformat(),
            requires_bridge=False,
            facility_id=None,
            draw=Decimal("0.00"),
            duration=0,
            cost=Decimal("0.00"),
            net=metrics.gross_savings,
            min_cash=self_funded.min_cash,
            respects_floor=True,
            rationale=(
                f"Cash after early payment stays >= floor across all {horizon_days} days; "
                "self-fund the discount."
            ),
        )

    breaches = [
        (payroll_floor - point.optimized_cash, point.day_index)
        for point in self_funded.points
        if point.optimized_cash < payroll_floor
    ]
    draw = _q2(max(deficit for deficit, _ in breaches))
    bridge_day = min(day for _, day in breaches)
    duration = horizon_days - bridge_day + 1

    eligible = facility is not None
    if eligible:
        eligible = (
            Decimal(str(facility["facility_limit"])) - Decimal(str(facility["current_drawn"]))
        ) >= draw and Decimal(str(facility["current_ratio"])) >= Decimal(
            str(facility["min_current_ratio"])
        )

    if not eligible or facility is None:
        return _decision(
            strategy="DEFER_TO_NET_DUE_DATE",
            invoice=invoice,
            discounted=metrics.discounted_amount,
            gross=metrics.gross_savings,
            apr=metrics.apr_pct,
            ear=metrics.ear_pct,
            payment_date=invoice.net_due_date,
            requires_bridge=False,
            facility_id=None,
            draw=Decimal("0.00"),
            duration=0,
            cost=Decimal("0.00"),
            net=Decimal("0.00"),
            min_cash=baseline.min_cash,
            respects_floor=baseline.respects_floor,
            rationale=(
                "Early payment would breach the payroll floor and no eligible facility "
                "covers the trough; defer to net due date."
            ),
        )

    rate = Decimal(str(facility["annual_rate"]))
    fee_pct = Decimal(str(facility["origination_fee_pct"]))
    cost = _q2(draw * rate * Decimal(duration) / Decimal("365") + draw * fee_pct)
    net = _q2(metrics.gross_savings - cost)

    if net <= 0:
        return _decision(
            strategy="DEFER_TO_NET_DUE_DATE",
            invoice=invoice,
            discounted=metrics.discounted_amount,
            gross=metrics.gross_savings,
            apr=metrics.apr_pct,
            ear=metrics.ear_pct,
            payment_date=invoice.net_due_date,
            requires_bridge=False,
            facility_id=None,
            draw=Decimal("0.00"),
            duration=0,
            cost=Decimal("0.00"),
            net=Decimal("0.00"),
            min_cash=baseline.min_cash,
            respects_floor=baseline.respects_floor,
            rationale="Bridge financing cost meets or exceeds the discount savings; defer.",
        )

    bridged = simulate_cash(
        start_date=start_date,
        starting_cash=starting_cash,
        payroll_floor=payroll_floor,
        inflows=inflows,
        outflows=outflows,
        payments=(payment,),
        bridge_amount=draw,
        bridge_day=bridge_day,
        bridge_rate=rate,
        horizon_days=horizon_days,
    )
    return _decision(
        strategy="CAPTURE_EARLY_DISCOUNT_WITH_CREDIT_BRIDGE",
        invoice=invoice,
        discounted=metrics.discounted_amount,
        gross=metrics.gross_savings,
        apr=metrics.apr_pct,
        ear=metrics.ear_pct,
        payment_date=deadline_date.isoformat(),
        requires_bridge=True,
        facility_id=str(facility["facility_id"]),
        draw=draw,
        duration=duration,
        cost=cost,
        net=net,
        min_cash=bridged.min_cash,
        respects_floor=bridged.respects_floor,
        rationale=(
            f"Draw {draw} to hold cash >= {payroll_floor} after early payment; "
            f"cost {cost} < savings {metrics.gross_savings}, net benefit {net}."
        ),
    )
