from fastapi.testclient import TestClient

from backend.app.main import app


def test_health_contract():
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "execution_mode": "LOCAL_SIMULATED_LEDGER",
        "offline_mode": True,
        "policy_version": "2026.1",
    }
