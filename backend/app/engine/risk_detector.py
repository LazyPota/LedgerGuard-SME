"""Deterministic duplicate and beneficiary risk detection.

No fuzzy scoring model, no LLM: three explicit layers plus an IBAN allowlist
comparison. Ambiguity escalates to human review, never to execution.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal, Sequence

from backend.app.schemas.contracts import InvoiceExtraction, SecurityFinding, VendorMasterCheck
from backend.app.schemas.domain import VendorMaster


@dataclass(frozen=True)
class InvoiceFingerprint:
    invoice_id: str
    document_sha256: str
    vendor_id: str
    vendor_name: str
    invoice_number: str
    issue_date: date
    total: Decimal


DuplicateCode = Literal[
    "NO_DUPLICATE",
    "DUPLICATE_ARTIFACT_HASH",
    "DUPLICATE_CANONICAL_ID",
    "SUSPECTED_SEMANTIC_DUPLICATE",
]


@dataclass(frozen=True)
class DuplicateDecision:
    code: DuplicateCode
    blocked: bool
    matched_invoice_id: str | None = None


def normalize_invoice_number(value: str) -> str:
    """INV-0042, inv42, INV 0042 and INV42 all collapse to INV42."""
    canonical = re.sub(r"[^A-Za-z0-9]", "", value).upper()
    match = re.match(r"^([A-Z]+)(\d+)$", canonical)
    if match:
        return f"{match.group(1)}{int(match.group(2))}"
    return canonical


def _normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def detect_duplicate(
    candidate: InvoiceFingerprint, existing: Sequence[InvoiceFingerprint]
) -> DuplicateDecision:
    for prior in existing:
        if prior.invoice_id == candidate.invoice_id:
            continue  # idempotent re-audit of the same record is not a duplicate
        if prior.document_sha256 == candidate.document_sha256:
            return DuplicateDecision("DUPLICATE_ARTIFACT_HASH", True, prior.invoice_id)
        if (
            prior.vendor_id == candidate.vendor_id
            and normalize_invoice_number(prior.invoice_number)
            == normalize_invoice_number(candidate.invoice_number)
        ):
            return DuplicateDecision("DUPLICATE_CANONICAL_ID", True, prior.invoice_id)
        same_vendor = _normalize_name(prior.vendor_name) == _normalize_name(candidate.vendor_name)
        same_amount = abs(prior.total - candidate.total) <= Decimal("0.01")
        close_date = abs((prior.issue_date - candidate.issue_date).days) <= 7
        if same_vendor and same_amount and close_date:
            return DuplicateDecision("SUSPECTED_SEMANTIC_DUPLICATE", False, prior.invoice_id)
    return DuplicateDecision("NO_DUPLICATE", False)


def verify_beneficiary(
    invoice: InvoiceExtraction,
    vendor: VendorMaster,
    security_findings: Sequence[SecurityFinding] = (),
) -> VendorMasterCheck:
    masked = f"{vendor.iban[:8]}****{vendor.iban[-4:]}" if len(vendor.iban) > 12 else vendor.masked_iban
    return VendorMasterCheck(
        vendor_id=vendor.vendor_id,
        legal_name=vendor.legal_name,
        approved_iban_masked=masked,
        iban_exact_match=invoice.iban_claimed == vendor.iban,
        bank_change_requested_in_invoice=any(
            f.owasp_id == "BEC_IBAN_SWAP" for f in security_findings
        ),
    )
