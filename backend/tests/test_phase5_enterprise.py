from pathlib import Path
import sys
import types

import psutil
import pytest
from fastapi.testclient import TestClient

cv2_stub = types.SimpleNamespace()
cv2_stub.data = types.SimpleNamespace(haarcascades="")
cv2_stub.CascadeClassifier = lambda *_a, **_k: types.SimpleNamespace(detectMultiScale=lambda *_: [])
sys.modules.setdefault("cv2", cv2_stub)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PLAYE_REPORTS_DIR", str(tmp_path / "reports"))
    from app.main import app

    return TestClient(app)


def test_telemetry_format(client):
    response = client.get("/api/system/telemetry")
    assert response.status_code == 200
    payload = response.json()

    for field in ("vram_used", "vram_total", "cpu_percent"):
        assert field in payload
        assert isinstance(payload[field], (int, float))


def test_telemetry_stability(client):
    process = psutil.Process()
    start_fds = process.num_fds() if hasattr(process, "num_fds") else None

    for _ in range(50):
        response = client.get("/api/system/telemetry")
        assert response.status_code == 200

    if start_fds is not None:
        end_fds = process.num_fds()
        assert end_fds - start_fds <= 2


def test_session_logs_append_and_read(client):
    first_batch = {
        "logs": [
            {"timestamp": "2026-01-01T00:00:00Z", "source": "vision", "message": "01:20 - Найден нож"},
        ]
    }
    second_batch = {
        "logs": [
            {"timestamp": "2026-01-01T00:01:00Z", "source": "ocr", "message": "01:45 - Распознан номер A123BC"},
        ]
    }

    assert client.post("/api/system/session-logs", json=first_batch).status_code == 200
    append_response = client.post("/api/system/session-logs", json=second_batch)
    assert append_response.status_code == 200
    assert append_response.json()["total"] == 2

    loaded = client.get("/api/system/session-logs")
    assert loaded.status_code == 200
    payload = loaded.json()
    assert payload["count"] == 2
    assert payload["logs"][1]["message"] == "01:45 - Распознан номер A123BC"


def test_case_save_and_load_playe(client):
    case_payload = {
        "case_id": "CASE-500",
        "date": "2026-02-15",
        "officer": "Иван Петров",
        "evidence": [{"id": "E-1", "title": "Нож", "time": "01:20"}],
        "metadata": {"location": "Склад"},
    }

    save_response = client.post("/api/system/cases/save", json=case_payload)
    assert save_response.status_code == 200
    save_json = save_response.json()
    assert save_json["path"].endswith(".playe")

    load_response = client.get("/api/system/cases/CASE-500")
    assert load_response.status_code == 200
    case_data = load_response.json()["case"]
    assert case_data["case_id"] == "CASE-500"
    assert case_data["officer"] == "Иван Петров"
