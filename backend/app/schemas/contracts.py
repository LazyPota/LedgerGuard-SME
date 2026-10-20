"""Strict API contracts (frontend boundary). Extend backward-compatibly only."""

from typing import Literal

from pydantic import ConfigDict, Field
from pydantic import BaseModel


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class HealthResponse(ApiModel):
    status: Literal["ok"] = "ok"
    execution_mode: Literal["LOCAL_SIMULATED_LEDGER"] = "LOCAL_SIMULATED_LEDGER"
    offline_mode: bool
    policy_version: str = Field(min_length=1)
