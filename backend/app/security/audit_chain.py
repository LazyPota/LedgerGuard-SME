"""Append-only, SHA-256 hash-chained forensic audit envelopes.

Each envelope commits to the previous envelope hash. The table rejects
UPDATE and DELETE at the database layer, so tampering requires dropping the
trigger (which verification then exposes via hash mismatch).

This proves internal consistency of the decision log. It does not prove
real-world bank ownership; see SECURITY_SELF_ASSESSMENT.md.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.app.schemas.contracts import ForensicDecisionEnvelope, VerifyChainResponse

GENESIS_HASH = "0" * 64

_SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_envelopes (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    trace_id TEXT NOT NULL UNIQUE,
    previous_hash TEXT NOT NULL,
    current_hash TEXT NOT NULL,
    envelope_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_envelopes(tenant_id, seq);
CREATE TRIGGER IF NOT EXISTS audit_no_update
BEFORE UPDATE ON audit_envelopes
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete
BEFORE DELETE ON audit_envelopes
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
"""


def _canonical(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


class AuditChain:
    def __init__(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path), timeout=20.0, isolation_level=None, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)

    def close(self) -> None:
        self._conn.close()

    def head_hash(self, tenant_id: str) -> str:
        row = self._conn.execute(
            "SELECT current_hash FROM audit_envelopes WHERE tenant_id = ? ORDER BY seq DESC LIMIT 1",
            (tenant_id,),
        ).fetchone()
        return GENESIS_HASH if row is None else str(row["current_hash"])

    def count(self, tenant_id: str) -> int:
        return int(
            self._conn.execute(
                "SELECT COUNT(*) AS n FROM audit_envelopes WHERE tenant_id = ?", (tenant_id,)
            ).fetchone()["n"]
        )

    def append(
        self,
        *,
        tenant_id: str,
        input_document_sha256: str,
        actor_identity: str,
        permission_tier: str,
        opa_policy_verdict: str,
        three_way_match_summary: dict[str, Any] | None = None,
        working_capital_optimization_summary: dict[str, Any] | None = None,
        sandbox_execution_verification: dict[str, Any] | None = None,
    ) -> ForensicDecisionEnvelope:
        previous = self.head_hash(tenant_id)
        seq = self.count(tenant_id) + 1
        timestamp = datetime.now(timezone.utc).isoformat()
        trace_id = f"trc_{timestamp[:10].replace('-', '')}_{seq:04d}"

        payload: dict[str, Any] = {
            "envelope_version": "1.0.0",
            "trace_id": trace_id,
            "timestamp_utc": timestamp,
            "previous_envelope_hash": previous,
            "input_document_sha256": input_document_sha256,
            "actor_identity": actor_identity,
            "permission_tier": permission_tier,
            "opa_policy_verdict": opa_policy_verdict,
            "three_way_match_summary": three_way_match_summary or {},
            "working_capital_optimization_summary": working_capital_optimization_summary or {},
            "sandbox_execution_verification": sandbox_execution_verification or {},
        }
        current = hashlib.sha256(_canonical(payload).encode("utf-8")).hexdigest()
        envelope = ForensicDecisionEnvelope(**payload, current_envelope_hash=current)

        self._conn.execute(
            "BEGIN IMMEDIATE"
        )
        try:
            self._conn.execute(
                """
                INSERT INTO audit_envelopes(tenant_id, trace_id, previous_hash, current_hash, envelope_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    tenant_id,
                    trace_id,
                    previous,
                    current,
                    envelope.model_dump_json(),
                ),
            )
            self._conn.execute("COMMIT")
        except BaseException:
            if self._conn.in_transaction:
                self._conn.execute("ROLLBACK")
            raise
        return envelope

    def envelopes(self, tenant_id: str) -> list[ForensicDecisionEnvelope]:
        rows = self._conn.execute(
            "SELECT envelope_json FROM audit_envelopes WHERE tenant_id = ? ORDER BY seq",
            (tenant_id,),
        ).fetchall()
        return [ForensicDecisionEnvelope.model_validate_json(row["envelope_json"]) for row in rows]

    def verify(self, tenant_id: str) -> VerifyChainResponse:
        rows = self._conn.execute(
            "SELECT * FROM audit_envelopes WHERE tenant_id = ? ORDER BY seq", (tenant_id,)
        ).fetchall()
        previous = GENESIS_HASH
        for row in rows:
            envelope = json.loads(row["envelope_json"])
            stored_hash = envelope.pop("current_envelope_hash", None)
            recomputed = hashlib.sha256(_canonical(envelope).encode("utf-8")).hexdigest()
            if (
                stored_hash != row["current_hash"]
                or recomputed != row["current_hash"]
                or row["previous_hash"] != previous
                or envelope.get("previous_envelope_hash") != previous
            ):
                return VerifyChainResponse(
                    valid=False,
                    envelopes_checked=len(rows),
                    genesis_hash=GENESIS_HASH,
                    latest_hash=previous,
                    tamper_detected_at_trace_id=row["trace_id"],
                    message="TAMPER_DETECTED",
                    chain_valid=False,
                    envelopes_verified=len(rows),
                    head_hash=previous,
                    broken_at_trace_id=row["trace_id"],
                )
            previous = row["current_hash"]

        return VerifyChainResponse(
            valid=True,
            envelopes_checked=len(rows),
            genesis_hash=GENESIS_HASH,
            latest_hash=previous,
            tamper_detected_at_trace_id=None,
            message="VERIFY_CHAIN_OK" if rows else "EMPTY_CHAIN",
            chain_valid=True,
            envelopes_verified=len(rows),
            head_hash=previous,
            broken_at_trace_id=None,
        )
