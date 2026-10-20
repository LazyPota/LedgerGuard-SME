from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, HTTPException

from backend.app.fixtures.benchmark import INVOICE_DOCUMENTS
from backend.app.schemas.contracts import (
    BatchAuditRequest,
    BatchAuditResponse,
    IngestInvoiceRequest,
    InvoiceRecord,
    RawInvoiceDocument,
)
from backend.app.state import get_state

router = APIRouter(tags=["invoices"])


def _custom_document(payload: dict) -> RawInvoiceDocument:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    suffix = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:8]
    return RawInvoiceDocument(
        document_id=str(payload.get("invoice_number") or f"INV-CUSTOM-{suffix}"),
        file_name=str(payload.get("file_name") or f"custom-{suffix}.json"),
        raw_text=str(payload.get("raw_untrusted_memo") or ""),
        structured_payload=payload,
    )


@router.post("/invoices/ingest", response_model=list[InvoiceRecord])
def ingest_invoice(request: IngestInvoiceRequest) -> list[InvoiceRecord]:
    state = get_state()
    if request.document_source == "SEEDED_BENCHMARK_BATCH":
        documents = list(INVOICE_DOCUMENTS)
    else:
        if not request.raw_payload:
            raise HTTPException(status_code=422, detail="raw_payload required for uploaded invoices")
        documents = [_custom_document(request.raw_payload)]
    try:
        return state.ingest_documents(documents)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/invoices/audit-batch", response_model=BatchAuditResponse)
def audit_batch(request: BatchAuditRequest) -> BatchAuditResponse:
    state = get_state()
    if request.tenant_id != state.tenant_id:
        raise HTTPException(status_code=403, detail="tenant mismatch")
    documents = [_custom_document(payload) for payload in request.invoices]
    try:
        results = state.ingest_documents(documents)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    envelopes = state.audit.envelopes(state.tenant_id)
    return BatchAuditResponse(
        batch_id=f"BATCH-{len(results):02d}-{results[0].invoice_id if results else 'EMPTY'}",
        results=results,
        audit_envelope_hashes=[e.current_envelope_hash for e in envelopes[-len(results) :]],
    )


@router.get("/invoices", response_model=list[InvoiceRecord])
def list_invoices() -> list[InvoiceRecord]:
    return list(get_state().invoices.values())


@router.get("/invoices/{invoice_id}", response_model=InvoiceRecord)
def get_invoice(invoice_id: str) -> InvoiceRecord:
    record = get_state().invoices.get(invoice_id)
    if record is None:
        raise HTTPException(status_code=404, detail="invoice not found")
    return record
