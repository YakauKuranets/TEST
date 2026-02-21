import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import base64
import types
import numpy as np

cv2_stub = types.SimpleNamespace(
    COLOR_RGB2BGR=0,
    COLOR_BGR2RGB=1,
    cvtColor=lambda arr, code: arr[..., ::-1] if getattr(arr, "ndim", 0) == 3 else arr,
    imread=lambda *_args, **_kwargs: None,
    imwrite=lambda *_args, **_kwargs: True,
    addWeighted=lambda a, *_args, **_kwargs: a,
    filter2D=lambda a, *_args, **_kwargs: a,
    blur=lambda a, *_args, **_kwargs: a,
    GaussianBlur=lambda a, *_args, **_kwargs: a,
    Laplacian=lambda a, *_args, **_kwargs: np.zeros_like(a),
)
sys.modules.setdefault("cv2", cv2_stub)

from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.models_config import MODELS_MANIFEST
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def make_image_b64(size=(16, 12), color=(120, 10, 220)):
    img = Image.new("RGB", size, color=color)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii"), size


def decode_size(image_b64: str):
    raw = base64.b64decode(image_b64)
    img = Image.open(BytesIO(raw))
    return img.size


def test_fs_manifest_and_strict_models_path(monkeypatch):
    assert isinstance(MODELS_MANIFEST, dict)
    assert "restoration" in MODELS_MANIFEST

    checked_paths = []

    def fake_exists(path):
        checked_paths.append(str(path))
        return False

    monkeypatch.setattr("app.api.routes.os.path.exists", fake_exists)

    with TestClient(app) as local_client:
        resp = local_client.get("/api/system/models-status")

    assert resp.status_code == 200
    assert checked_paths
    assert any(str(p).startswith(r"D:\PLAYE\models") for p in checked_paths)


def test_models_status_api_returns_boolean_map(client):
    resp = client.get("/api/system/models-status")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert data
    assert all(isinstance(v, bool) for v in data.values())


def test_ai_deblur_base64_roundtrip_keeps_size(client):
    models_root = Path(r"D:\PLAYE\models")
    models_root.mkdir(parents=True, exist_ok=True)
    fake_weight = models_root / "nafnet_gopro.pth"
    fake_weight.write_bytes(b"fake-weights")

    img_b64, original_size = make_image_b64(size=(19, 11))
    resp = client.post("/api/ai/deblur", json={"image_base64": img_b64, "model_id": "nafnet", "intensity": 40})

    assert resp.status_code == 200
    data = resp.json()
    assert "result" in data and isinstance(data["result"], str)
    assert data["result"] != img_b64
    assert decode_size(data["result"]) == original_size


def test_ai_deblur_missing_model_returns_404(client):
    img_b64, _ = make_image_b64()
    resp = client.post("/api/ai/deblur", json={"image_base64": img_b64, "model_id": "unknown-model"})

    assert resp.status_code in {400, 404}
    assert resp.json().get("error") == "Model not found on disk"
