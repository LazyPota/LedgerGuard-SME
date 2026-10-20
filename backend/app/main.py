from datetime import datetime, timezone

from fastapi import FastAPI

from backend.app.api import (
    routes_approvals,
    routes_audit,
    routes_invoices,
    routes_treasury,
)
from backend.app.config import get_settings
from backend.app.schemas.contracts import HealthResponse
from backend.app.state import get_state

app = FastAPI(
    title="LedgerGuard SME",
    version="0.1.0",
    description=(
        "Deterministic, auditable SME finance copilot backend. "
        "All financial arithmetic is Decimal-based; AI is confined to extraction."
    ),
)

for router in (
    routes_invoices.router,
    routes_treasury.router,
    routes_approvals.router,
    routes_audit.router,
):
    app.include_router(router, prefix="/api/v1")


@app.get("/api/v1/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    settings = get_settings()
    state = get_state()
    return HealthResponse(
        offline_mode=settings.offline_deterministic_mode,
        policy_version=settings.policy_version,
        database_connected=True,
        audit_chain_valid=state.verify_chain().valid,
        as_of_timestamp_utc=datetime.now(timezone.utc).isoformat(),
    )
