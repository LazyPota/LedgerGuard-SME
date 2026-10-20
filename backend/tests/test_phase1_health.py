from fastapi.testclient import TestClient

from backend.app.main import app


def test_health_contract():
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["execution_mode"] == "LOCAL_SIMULATED_LEDGER"
    assert body["offline_mode"] is True
    assert body["policy_version"] == "2026.1"
    assert body["database_connected"] is True
    assert body["audit_chain_valid"] is True
