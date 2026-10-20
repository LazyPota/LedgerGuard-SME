from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.app.execution.ledger_sandbox import (
    InsufficientFunds,
    InvoiceNotPayable,
)
from backend.app.schemas.contracts import (
    ApprovalDecisionResponse,
    ExecuteRequest,
    ExecutionReceipt,
    SubmitApprovalDecisionRequest,
    TriggerAutoExecutionRequest,
)
from backend.app.state import ApprovalInvalid, PolicyDenied, UnknownInvoice, get_state

router = APIRouter(tags=["approvals", "execution"])


@router.post("/approvals/{action_id}/decide", response_model=ApprovalDecisionResponse)
def decide(action_id: str, request: SubmitApprovalDecisionRequest) -> ApprovalDecisionResponse:
    try:
        return get_state().decide(action_id, request)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="approval action not found") from exc
    except ApprovalInvalid as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _execute(invoice_id: str, idempotency_key: str, approval_token: str | None) -> ExecutionReceipt:
    try:
        return get_state().execute(
            invoice_id=invoice_id,
            idempotency_key=idempotency_key,
            approval_token=approval_token,
        )
    except UnknownInvoice as exc:
        raise HTTPException(status_code=404, detail="invoice not found") from exc
    except PolicyDenied as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except InvoiceNotPayable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except InsufficientFunds as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/executions/trigger-tier2-auto", response_model=ExecutionReceipt)
def trigger_tier2_auto(request: TriggerAutoExecutionRequest) -> ExecutionReceipt:
    return _execute(request.invoice_id, request.idempotency_key, None)


@router.post("/execution/run", response_model=ExecutionReceipt)
def run_execution(request: ExecuteRequest) -> ExecutionReceipt:
    invoice_id = request.invoice_id
    if invoice_id is None and request.action_id:
        invoice_id = request.action_id.removeprefix("ACT-")
    if invoice_id is None:
        raise HTTPException(status_code=422, detail="invoice_id or action_id required")
    return _execute(invoice_id, request.idempotency_key, request.approval_token)


@router.get("/executions", response_model=list[ExecutionReceipt])
def list_executions() -> list[ExecutionReceipt]:
    state = get_state()
    return state.ledger.list_executions(state.tenant_id)
