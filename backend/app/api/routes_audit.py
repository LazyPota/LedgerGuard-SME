from __future__ import annotations

from fastapi import APIRouter

from backend.app.schemas.contracts import ForensicDecisionEnvelope, VerifyChainResponse
from backend.app.state import get_state

router = APIRouter(tags=["audit"])


@router.get("/audit/envelopes", response_model=list[ForensicDecisionEnvelope])
def list_envelopes() -> list[ForensicDecisionEnvelope]:
    state = get_state()
    return state.audit.envelopes(state.tenant_id)


@router.post("/audit/verify-chain", response_model=VerifyChainResponse)
def verify_chain() -> VerifyChainResponse:
    return get_state().verify_chain()


@router.get("/audit/verify", response_model=VerifyChainResponse)
def verify_chain_get() -> VerifyChainResponse:
    return get_state().verify_chain()
