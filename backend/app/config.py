"""Typed runtime settings. All values overridable via environment/.env.

Secrets are never logged. ``llm_api_key`` is optional precisely because the
default deployment mode is fully offline and deterministic.
"""

from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    tenant_id: str = "sme_01"
    offline_deterministic_mode: bool = True
    execution_mode: Literal["LOCAL_SIMULATED_LEDGER"] = "LOCAL_SIMULATED_LEDGER"
    policy_version: str = "2026.1"

    # Tier 2 bounded auto-execution limits.
    tier2_single_payment_cap: Decimal = Decimal("2500.00")
    tier2_daily_payment_cap: Decimal = Decimal("5000.00")

    # Fail-closed extraction confidence floor.
    extraction_confidence_floor: Decimal = Decimal("0.8500")

    # Optional zero-tool LLM extraction; offline mode never calls it.
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_model: str = "gpt-4.1-mini"

    database_path: str = "ledgerguard.db"
    audit_log_path: str = "evidence/forensic_audit_log.jsonl"


@lru_cache
def get_settings() -> Settings:
    return Settings()
