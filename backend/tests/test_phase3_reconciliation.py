from datetime import date
from decimal import Decimal

from backend.app.engine.reconciliation import reconcile_invoice
from backend.app.engine.risk_detector import (
    InvoiceFingerprint,
    normalize_invoice_number,
    detect_duplicate,
    verify_beneficiary,
)
from backend.app.fixtures.benchmark import (
    GRNS,
    INVOICE_DOCUMENTS,
    POS,
    VENDORS,
    extract_fixture,
)


def _fixture(number: str):
    doc = next(d for d in INVOICE_DOCUMENTS if d.document_id == number)
    return extract_fixture(doc)


def test_normalizes_canonical_invoice_numbers():
    assert normalize_invoice_number("INV-0042") == normalize_invoice_number("inv42")
    assert normalize_invoice_number("INV-42A") != normalize_invoice_number("INV-42")


def test_clean_three_way_match_is_verified():
    outcome = _fixture("INV-2026-101")
    po = POS[outcome.invoice.referenced_po_id]
    grn = GRNS[po.po_id]
    record = reconcile_invoice(outcome, po, grn, VENDORS[outcome.invoice.vendor_id_claimed])

    assert record.reconciliation_findings.overall_match_status == "VERIFIED_ELIGIBLE"
    assert record.reconciliation_findings.math_reconciled is True
    assert str(record.reconciliation_findings.computed_total) == "40000.00"
    assert record.reconciliation_findings.discrepancies == []
    assert record.vendor_master_check.iban_exact_match is True


def test_quantity_over_grn_is_quarantined_with_delta():
    outcome = _fixture("INV-2026-102")
    po = POS[outcome.invoice.referenced_po_id]
    grn = GRNS[po.po_id]
    record = reconcile_invoice(outcome, po, grn, VENDORS[outcome.invoice.vendor_id_claimed])

    findings = record.reconciliation_findings
    assert findings.overall_match_status == "QUARANTINED_DISCREPANCY"
    assert str(findings.computed_total) == "21000.00"
    codes = [d.code for d in findings.discrepancies]
    assert "QUANTITY_EXCEEDS_GRN" in codes
    overbill = next(d for d in findings.discrepancies if d.code == "QUANTITY_EXCEEDS_GRN")
    assert str(overbill.financial_impact_delta) == "4000.00"
    assert overbill.severity == "HIGH"


def test_missing_grn_requires_attestation():
    outcome = _fixture("INV-2026-103")
    po = POS[outcome.invoice.referenced_po_id]
    record = reconcile_invoice(outcome, po, None, VENDORS[outcome.invoice.vendor_id_claimed])

    findings = record.reconciliation_findings
    assert findings.overall_match_status == "PENDING_GRN_ATTESTATION"
    assert [d.code for d in findings.discrepancies] == ["MISSING_GRN"]
    assert str(findings.computed_total) == "6400.00"
    assert record.goods_receipt_note is None


def test_iban_swap_blocks_and_flags_beneficiary_mismatch():
    outcome = _fixture("INV-2026-104")
    po = POS[outcome.invoice.referenced_po_id]
    record = reconcile_invoice(outcome, po, GRNS[po.po_id], VENDORS[outcome.invoice.vendor_id_claimed])

    check = record.vendor_master_check
    assert check.iban_exact_match is False
    assert check.bank_change_requested_in_invoice is True
    assert check.approved_iban_masked.endswith("1104")
    assert record.reconciliation_findings.overall_match_status == "BLOCKED_SECURITY_VIOLATION"
    assert "ASI01_GOAL_HIJACK" in {f.owasp_id for f in record.reconciliation_findings.security_flags}
    assert "BEC_IBAN_SWAP" in {f.owasp_id for f in record.reconciliation_findings.security_flags}


def test_price_above_po_is_flagged():
    outcome = _fixture("INV-2026-105")
    po = POS[outcome.invoice.referenced_po_id]
    from backend.app.schemas.domain import PurchaseOrder, PurchaseOrderLine

    tighter_po = PurchaseOrder(
        po_id=po.po_id,
        vendor_id=po.vendor_id,
        currency=po.currency,
        lines=[
            PurchaseOrderLine(
                sku=po.lines[0].sku,
                description=po.lines[0].description,
                unit_of_measure=po.lines[0].unit_of_measure,
                quantity_ordered=po.lines[0].quantity_ordered,
                unit_price=Decimal("1700.00"),
            )
        ],
    )
    record = reconcile_invoice(outcome, tighter_po, GRNS[po.po_id], VENDORS[outcome.invoice.vendor_id_claimed])
    finding = next(d for d in record.reconciliation_findings.discrepancies if d.code == "PRICE_EXCEEDS_PO")
    assert str(finding.financial_impact_delta) == "100.00"


def test_line_math_error_is_flagged():
    outcome = _fixture("INV-2026-105")
    tampered = outcome.model_copy(
        update={
            "invoice": outcome.invoice.model_copy(
                update={
                    "line_items": [
                        outcome.invoice.line_items[0].model_copy(
                            update={"line_total_billed": Decimal("9999.00")}
                        )
                    ]
                }
            )
        }
    )
    po = POS[tampered.invoice.referenced_po_id]
    record = reconcile_invoice(tampered, po, GRNS[po.po_id], VENDORS[tampered.invoice.vendor_id_claimed])
    assert "MATH_EXTENSION_ERROR" in {d.code for d in record.reconciliation_findings.discrepancies}
    assert record.reconciliation_findings.math_reconciled is False


def _fp(**overrides) -> InvoiceFingerprint:
    base = dict(
        invoice_id="INV-OLD",
        document_sha256="a" * 64,
        vendor_id="VND-SZ-8821",
        vendor_name="Shenzhen Precision Servo Ltd.",
        invoice_number="INV-42",
        issue_date=date(2026, 11, 1),
        total=Decimal("40000.00"),
    )
    return InvoiceFingerprint(**{**base, **overrides})


def test_exact_artifact_hash_is_blocked():
    candidate = _fp(invoice_id="INV-NEW")
    decision = detect_duplicate(candidate, [_fp(invoice_id="INV-OLD")])
    assert decision.blocked is True
    assert decision.code == "DUPLICATE_ARTIFACT_HASH"


def test_canonical_identifier_duplicate_is_blocked():
    candidate = _fp(invoice_id="INV-NEW", document_sha256="b" * 64, invoice_number="inv-0042")
    decision = detect_duplicate(candidate, [_fp(invoice_number="INV-42")])
    assert decision.blocked is True
    assert decision.code == "DUPLICATE_CANONICAL_ID"


def test_fuzzy_financial_fingerprint_is_suspected():
    candidate = _fp(invoice_id="INV-NEW", document_sha256="c" * 64, invoice_number="INV-42A")
    decision = detect_duplicate(candidate, [_fp()])
    assert decision.blocked is False
    assert decision.code == "SUSPECTED_SEMANTIC_DUPLICATE"
    assert decision.matched_invoice_id == "INV-OLD"


def test_different_amount_is_not_duplicate():
    candidate = _fp(document_sha256="d" * 64, invoice_number="INV-99", total=Decimal("41000.00"))
    assert detect_duplicate(candidate, [_fp()]).code == "NO_DUPLICATE"


def test_iban_verification_masks_and_compares():
    outcome = _fixture("INV-2026-101")
    check = verify_beneficiary(outcome.invoice, VENDORS[outcome.invoice.vendor_id_claimed], outcome.security_findings)
    assert check.iban_exact_match is True
    assert check.approved_iban_masked == "CN88WEBK****4829"
    assert check.bank_change_requested_in_invoice is False
