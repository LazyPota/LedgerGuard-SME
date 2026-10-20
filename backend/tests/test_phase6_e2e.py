from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.state import reset_state


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("LEDGERGUARD_DB_PATH", str(tmp_path / "api.db"))
    reset_state()
    with TestClient(app) as test_client:
        yield test_client
    reset_state()


def _ingest(client: TestClient) -> list[dict]:
    response = client.post(
        "/api/v1/invoices/ingest", json={"document_source": "SEEDED_BENCHMARK_BATCH"}
    )
    assert response.status_code == 200, response.text
    return response.json()


def _approve(client: TestClient, invoice_id: str = "INV-2026-101", amount: str = "39200.00"):
    return client.post(
        f"/api/v1/approvals/ACT-{invoice_id}/decide",
        json={
            "approval_id": f"ACT-{invoice_id}",
            "invoice_id": invoice_id,
            "decision": "APPROVE_EXECUTION",
            "approver_id": "mgr_01",
            "approver_role": "FINANCE_MANAGER",
            "confirmed_total_amount": amount,
            "confirmed_iban_tail": "4829",
            "reviewer_notes": "Verified against PO and treasury policy.",
            "idempotency_key": f"idem-approval-{invoice_id}",
        },
    )


def test_full_pipeline_end_to_end(client):
    records = _ingest(client)
    assert len(records) == 5
    by_id = {r["invoice_id"]: r for r in records}

    assert by_id["INV-2026-101"]["operational_state"] == "PENDING_HITL_TIER_3"
    assert by_id["INV-2026-101"]["permission_tier"] == "TIER_3_HITL_REQUIRED"
    assert by_id["INV-2026-102"]["operational_state"] == "BLOCKED_DISCREPANCY"
    assert by_id["INV-2026-103"]["operational_state"] == "PROPOSED"
    assert by_id["INV-2026-104"]["operational_state"] == "BLOCKED_SECURITY_VIOLATION"
    assert by_id["INV-2026-104"]["permission_tier"] == "TIER_4_FORBIDDEN"

    treasury = client.get("/api/v1/treasury/summary").json()
    assert len(treasury["daily_cash_trajectory"]) == 30
    assert len(treasury["credit_facilities"]) == 3
    assert float(treasury["min_projected_30d_cash_optimized"]) >= float(
        treasury["payroll_reserve_floor"]
    )
    assert treasury["current_cash_balance"] == "77200.00"

    # Tier 3 without an approval token is denied.
    denied = client.post(
        "/api/v1/execution/run",
        json={
            "action_id": "ACT-INV-2026-101",
            "idempotency_key": "idem-e2e-denied",
            "approval_token": None,
        },
    )
    assert denied.status_code == 403

    # Tier 3 with a mismatched confirmed amount is rejected.
    wrong = _approve(client, amount="1.00")
    assert wrong.status_code == 400

    approved = _approve(client)
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["approval_status"] == "APPROVED"
    token = body["approval_token"]
    assert token

    executed = client.post(
        "/api/v1/execution/run",
        json={
            "action_id": "ACT-INV-2026-101",
            "idempotency_key": "idem-e2e-exec-1",
            "approval_token": token,
        },
    )
    assert executed.status_code == 200, executed.text
    receipt = executed.json()
    assert receipt["status"] == "SIMULATED_EXECUTED"
    assert receipt["execution_environment"] == "SANDBOX_SIMULATION"
    assert receipt["pre_execution_cash_balance"] == "77200.00"
    assert receipt["disbursed_amount"] == "39200.00"
    assert receipt["credit_drawn_amount"] == "48200.00"
    assert receipt["post_execution_cash_balance"] == "86200.00"
    assert receipt["post_state_invariant_verified"] is True

    replay = client.post(
        "/api/v1/execution/run",
        json={
            "action_id": "ACT-INV-2026-101",
            "idempotency_key": "idem-e2e-exec-1",
            "approval_token": token,
        },
    )
    assert replay.json()["status"] == "IDEMPOTENT_REPLAY_NOOP"
    assert client.get("/api/v1/executions").json()[0]["execution_id"] == receipt["execution_id"]

    envelopes = client.get("/api/v1/audit/envelopes").json()
    assert len(envelopes) >= 6
    verify = client.get("/api/v1/audit/verify").json()
    assert verify["valid"] is True
    assert verify["message"] == "VERIFY_CHAIN_OK"
    assert verify["envelopes_checked"] == len(envelopes)
    assert verify["chain_valid"] is True


def test_tier2_auto_execution_on_feasible_cash(client, monkeypatch, tmp_path):
    reset_state()
    monkeypatch.setenv("LEDGERGUARD_DB_PATH", str(tmp_path / "tier2.db"))
    monkeypatch.setenv("LEDGERGUARD_STARTING_CASH", "150000.00")
    reset_state()
    records = _ingest(client)
    by_id = {r["invoice_id"]: r for r in records}
    assert by_id["INV-2026-105"]["permission_tier"] == "TIER_2_BOUNDED_AUTO"
    response = client.post(
        "/api/v1/executions/trigger-tier2-auto",
        json={
            "invoice_id": "INV-2026-105",
            "idempotency_key": "idem-tier2-105",
            "operator_id": "system",
        },
    )
    assert response.status_code == 200, response.text
    receipt = response.json()
    assert receipt["status"] == "SIMULATED_EXECUTED"
    assert receipt["post_state_invariant_verified"] is True
    assert receipt["pre_execution_cash_balance"] == "150000.00"
    assert receipt["post_execution_cash_balance"] == "148200.00"


def test_audit_chain_detects_tampering(client):
    _ingest(client)
    assert client.get("/api/v1/audit/verify").json()["valid"] is True

    db_path = sqlite3.connect(__import__("os").environ["LEDGERGUARD_DB_PATH"])
    try:
        db_path.execute("DROP TRIGGER audit_no_update")
        db_path.execute(
            "UPDATE audit_envelopes SET envelope_json = replace(envelope_json, 'ALLOW', 'DENY_SECURITY_POLICY') WHERE seq = 1"
        )
        db_path.commit()
    finally:
        db_path.close()

    verify = client.get("/api/v1/audit/verify").json()
    assert verify["valid"] is False
    assert verify["chain_valid"] is False
    assert verify["message"] == "TAMPER_DETECTED"
    assert verify["tamper_detected_at_trace_id"]


def test_audit_is_append_only(client):
    _ingest(client)
    db = sqlite3.connect(__import__("os").environ["LEDGERGUARD_DB_PATH"])
    try:
        with pytest.raises(sqlite3.DatabaseError):
            db.execute("DELETE FROM audit_envelopes")
            db.commit()
    finally:
        db.close()


def test_unknown_invoice_returns_404(client):
    assert client.get("/api/v1/invoices/NOPE").status_code == 404
    assert (
        client.post(
            "/api/v1/execution/run",
            json={"action_id": "ACT-NOPE", "idempotency_key": "idem-nope-123"},
        ).status_code
        == 404
    )
