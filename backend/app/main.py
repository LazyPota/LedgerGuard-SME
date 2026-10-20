from fastapi import FastAPI

from backend.app.config import get_settings
from backend.app.schemas.contracts import HealthResponse

app = FastAPI(
    title="LedgerGuard SME",
    version="0.1.0",
    description=(
        "Deterministic, auditable SME finance copilot backend. "
        "All financial arithmetic is Decimal-based; AI is confined to extraction."
    ),
)


@app.get("/api/v1/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        offline_mode=settings.offline_deterministic_mode,
        policy_version=settings.policy_version,
    )
