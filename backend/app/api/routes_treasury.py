from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.app.schemas.contracts import (
    DailyCashPoint,
    OptimizeRequest,
    OptimizeResponse,
    TreasurySummaryResponse,
)
from backend.app.state import get_state

router = APIRouter(tags=["treasury"])


@router.get("/treasury/summary", response_model=TreasurySummaryResponse)
def treasury_summary() -> TreasurySummaryResponse:
    return get_state().treasury_summary()


@router.get("/cash-forecast", response_model=list[DailyCashPoint])
def cash_forecast() -> list[DailyCashPoint]:
    return get_state().treasury_summary().daily_cash_trajectory


@router.post("/working-capital/optimize", response_model=OptimizeResponse)
def optimize(request: OptimizeRequest) -> OptimizeResponse:
    state = get_state()
    if request.tenant_id != state.tenant_id:
        raise HTTPException(status_code=403, detail="tenant mismatch")
    result = state.optimize(
        request.verified_invoice_ids,
        horizon_days=request.horizon_days,
        floor=request.min_payroll_reserve,
    )
    return OptimizeResponse.model_validate(result)
