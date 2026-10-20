"""Deterministic 3-way reconciliation: Invoice vs Purchase Order vs GRN.

Zero LLM imports. All arithmetic is Decimal. Any ambiguity resolves to a
quarantine state, never a silent pass.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_EVEN

from backend.app.engine.risk_detector import verify_beneficiary
from backend.app.schemas.contracts import (
    DiscrepancyFinding,
    ExtractionOutcome,
    GoodsReceiptNoteRecord,
    GRNLineItem,
    POLineItem,
    PurchaseOrderRecord,
    ReconciliationFindings,
    ThreeWayMatchRecord,
)
from backend.app.schemas.domain import (
    GoodsReceiptNote,
    PurchaseOrder,
    VendorMaster,
)

_PRICE_QUANT = Decimal("0.0001")


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)


def _po_record(po: PurchaseOrder) -> PurchaseOrderRecord:
    return PurchaseOrderRecord(
        po_id=po.po_id,
        vendor_id=po.vendor_id,
        order_date=po.order_date,
        status=po.status,
        line_items=[
            POLineItem(
                sku=line.sku,
                description=line.description,
                unit_of_measure=line.unit_of_measure,
                quantity_ordered=line.quantity_ordered,
                unit_price_contracted=line.unit_price,
                line_total=_q2(line.quantity_ordered * line.unit_price),
            )
            for line in po.lines
        ],
    )


def _grn_record(grn: GoodsReceiptNote) -> GoodsReceiptNoteRecord:
    return GoodsReceiptNoteRecord(
        grn_id=grn.grn_id,
        po_id=grn.po_id,
        received_date=grn.received_date,
        warehouse_verified_by=grn.warehouse_verified_by,
        line_items=[
            GRNLineItem(
                sku=line.sku,
                quantity_received=line.quantity_received,
                quantity_accepted=line.quantity_received - line.quantity_rejected,
                condition_notes="",
            )
            for line in grn.lines
        ],
    )


def reconcile_invoice(
    outcome: ExtractionOutcome,
    po: PurchaseOrder | None,
    grn: GoodsReceiptNote | None,
    vendor: VendorMaster,
) -> ThreeWayMatchRecord:
    invoice = outcome.invoice
    discrepancies: list[DiscrepancyFinding] = []

    # 1. Line extensions and header math must reconcile exactly.
    billed_sum = sum((item.line_total_billed for item in invoice.line_items), Decimal("0"))
    for item in invoice.line_items:
        expected = _q2(item.quantity_billed * item.unit_price_billed)
        if expected != item.line_total_billed:
            discrepancies.append(
                DiscrepancyFinding(
                    code="MATH_EXTENSION_ERROR",
                    severity="HIGH",
                    line_sku=item.mapped_po_sku,
                    expected_value=str(expected),
                    actual_value=str(item.line_total_billed),
                    financial_impact_delta=_q2(item.line_total_billed - expected),
                    explanation="Line extension does not equal quantity multiplied by unit price.",
                )
            )
    claimed_subtotal = _q2(billed_sum)
    claimed_total = _q2(claimed_subtotal + invoice.tax_claimed)
    if claimed_subtotal != invoice.subtotal_claimed or claimed_total != invoice.total_claimed:
        discrepancies.append(
            DiscrepancyFinding(
                code="MATH_EXTENSION_ERROR",
                severity="HIGH",
                expected_value=str(claimed_total),
                actual_value=str(invoice.total_claimed),
                financial_impact_delta=_q2(invoice.total_claimed - claimed_total),
                explanation="Invoice header total does not equal line totals plus tax.",
            )
        )

    # 2. Per-line quantity and price reconciliation against PO and GRN.
    po_lines = po.line_by_sku if po is not None else {}
    grn_lines = grn.line_by_sku if grn is not None else {}
    computed_subtotal = Decimal("0")

    for item in invoice.line_items:
        multiplier = item.unit_conversion_multiplier
        converted_qty = item.quantity_billed * multiplier
        converted_price = (item.unit_price_billed / multiplier).quantize(
            _PRICE_QUANT, rounding=ROUND_HALF_EVEN
        )

        po_line = po_lines.get(item.mapped_po_sku)
        if po_line is None:
            discrepancies.append(
                DiscrepancyFinding(
                    code="LOW_LEXICAL_OVERLAP",
                    severity="HIGH",
                    line_sku=item.mapped_po_sku,
                    expected_value="PO line with matching SKU",
                    actual_value="unmatched",
                    financial_impact_delta="0.00",
                    explanation="Billed line could not be matched to a PO line; human review required.",
                )
            )
            payable_qty = converted_qty
        else:
            payable_qty = converted_qty
            ceiling = (po_line.unit_price * (1 + po.price_tolerance)).quantize(
                _PRICE_QUANT, rounding=ROUND_HALF_EVEN
            )
            if converted_price > ceiling:
                delta = _q2((converted_price - po_line.unit_price) * converted_qty)
                discrepancies.append(
                    DiscrepancyFinding(
                        code="PRICE_EXCEEDS_PO",
                        severity="HIGH",
                        line_sku=item.mapped_po_sku,
                        expected_value=str(_q2(ceiling)),
                        actual_value=str(_q2(converted_price)),
                        financial_impact_delta=delta,
                        explanation="Converted unit price exceeds contracted PO price tolerance.",
                    )
                )

        accepted = None
        grn_line = grn_lines.get(item.mapped_po_sku)
        if grn_line is not None:
            accepted = grn_line.quantity_received - grn_line.quantity_rejected
            if converted_qty > accepted:
                delta = _q2((converted_qty - accepted) * converted_price)
                discrepancies.append(
                    DiscrepancyFinding(
                        code="QUANTITY_EXCEEDS_GRN",
                        severity="HIGH",
                        line_sku=item.mapped_po_sku,
                        expected_value=f"{accepted.normalize()} accepted on GRN",
                        actual_value=f"{converted_qty.normalize()} billed",
                        financial_impact_delta=delta,
                        explanation="Billed quantity exceeds warehouse accepted quantity.",
                    )
                )
                payable_qty = min(payable_qty, accepted)

        computed_subtotal += payable_qty * converted_price

    computed_subtotal = _q2(computed_subtotal)
    computed_tax = _q2(invoice.tax_claimed)
    computed_total = _q2(computed_subtotal + computed_tax)

    if grn is None:
        discrepancies.append(
            DiscrepancyFinding(
                code="MISSING_GRN",
                severity="WARNING",
                expected_value="Goods Receipt Note filed by Receiving Lead",
                actual_value="null (Awaiting warehouse intake scan)",
                financial_impact_delta="0.00",
                explanation="Warehouse GRN intake scan missing. Awaiting attestation before staging.",
            )
        )

    security_flags = list(outcome.security_findings)
    vendor_check = verify_beneficiary(invoice, vendor, security_flags)
    if not vendor_check.iban_exact_match:
        from backend.app.schemas.contracts import SecurityFinding

        security_flags.append(
            SecurityFinding(
                owasp_id="BEC_IBAN_SWAP",
                trigger_excerpt_escaped=f"Claimed: {invoice.iban_claimed} vs Approved Master: {vendor_check.approved_iban_masked}",
                policy_rule_id="POLICY_VENDOR_MASTER_IBAN_LOCK",
                action_taken="Blocked by PolicyGuard. Vendor Master edits strictly forbidden in document pipeline (Tier 4).",
            )
        )
    if invoice.suspicious_instructions_detected and not any(
        f.owasp_id == "ASI01_GOAL_HIJACK" for f in security_flags
    ):
        security_flags.append(
            SecurityFinding(
                owasp_id="ASI01_GOAL_HIJACK",
                trigger_excerpt_escaped="suspicious_instructions_detected=true",
                policy_rule_id="POLICY_PROMPT_INJECTION_DEFENSE_V1",
                action_taken="Quarantined document memo. Prevented execution pipeline escalation.",
            )
        )

    hard_failures = any(d.severity in ("HIGH", "CRITICAL") for d in discrepancies)
    missing_grn = any(d.code == "MISSING_GRN" for d in discrepancies)
    if security_flags:
        status = "BLOCKED_SECURITY_VIOLATION"
    elif hard_failures:
        status = "QUARANTINED_DISCREPANCY"
    elif missing_grn:
        status = "PENDING_GRN_ATTESTATION"
    else:
        status = "VERIFIED_ELIGIBLE"

    findings = ReconciliationFindings(
        overall_match_status=status,
        math_reconciled=not any(
            d.code in ("MATH_EXTENSION_ERROR", "QUANTITY_EXCEEDS_GRN", "PRICE_EXCEEDS_PO")
            for d in discrepancies
        ),
        computed_subtotal=computed_subtotal,
        computed_tax=computed_tax,
        computed_total=computed_total,
        discrepancies=discrepancies,
        security_flags=security_flags,
    )

    return ThreeWayMatchRecord(
        purchase_order=_po_record(po) if po is not None else None,
        goods_receipt_note=_grn_record(grn) if grn is not None else None,
        vendor_master_check=vendor_check,
        reconciliation_findings=findings,
    )
