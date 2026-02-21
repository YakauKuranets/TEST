import sys
from io import BytesIO
from pathlib import Path
import base64

import pytest
import types
import numpy as np

cv2_stub = types.SimpleNamespace(
    COLOR_RGB2BGR=0,
    COLOR_BGR2RGB=1,
    COLOR_BGR2GRAY=2,
    INTER_LINEAR=1,
    cvtColor=lambda arr, code: (arr[..., ::-1] if getattr(arr, "ndim", 0) == 3 and code in {0,1} else (arr.mean(axis=2).astype("uint8") if getattr(arr, "ndim", 0)==3 else arr)),
    split=lambda arr: [arr[..., i] for i in range(arr.shape[2])] if getattr(arr, "ndim", 0)==3 else [arr],
    merge=lambda channels: np.stack(channels, axis=2),
    GaussianBlur=lambda arr, *_a, **_k: arr,
    addWeighted=lambda a, *_a2, **_k2: a,
    data=types.SimpleNamespace(haarcascades=""),
    CascadeClassifier=lambda *_a, **_k: types.SimpleNamespace(detectMultiScale=lambda *_: []),
)
sys.modules.setdefault("cv2", cv2_stub)

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


def _b64_from_pil(img: Image.Image) -> str:
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _decode_png_b64(data: str) -> Image.Image:
    raw = base64.b64decode(data)
    return Image.open(BytesIO(raw))


@pytest.fixture
def client():
    return TestClient(app)


def test_yolo_valid(client):
    img = Image.new("RGB", (128, 96), "black")
    draw = ImageDraw.Draw(img)
    draw.rectangle([20, 25, 95, 70], fill=(190, 190, 190))

    resp = client.post("/api/ai/detect", json={"image_base64": _b64_from_pil(img)})
    assert resp.status_code == 200
    body = resp.json()
    detections = body.get("detections", [])
    assert len(detections) > 0
    for det in detections:
        assert "bbox" in det and "class" in det and "conf" in det


def test_yolo_empty(client):
    img = Image.new("RGB", (128, 128), "black")
    resp = client.post("/api/ai/detect", json={"image_base64": _b64_from_pil(img)})
    assert resp.status_code == 200
    detections = resp.json().get("detections", [])
    assert len(detections) == 0


def test_yolo_corrupted(client):
    resp = client.post("/api/ai/detect", json={"image_base64": base64.b64encode(b"not-an-image").decode("ascii")})
    assert resp.status_code in {400, 422}
    text = resp.text.lower()
    assert "image" in text or "validation" in text or "invalid" in text


def test_ocr_success(client, monkeypatch):
    import app.api.routes as routes

    monkeypatch.setattr(routes, "_run_ocr", lambda _img: {"text": "A123BC", "confidence": 0.98})
    img = Image.new("RGB", (220, 80), "white")
    draw = ImageDraw.Draw(img)
    draw.text((20, 20), "A123BC", fill="black")

    resp = client.post("/api/ai/ocr", json={"image_base64": _b64_from_pil(img)})
    assert resp.status_code == 200
    assert "A123BC" in resp.json().get("text", "")


def test_ocr_no_text(client):
    img = Image.new("RGB", (220, 80), (100, 100, 100))
    resp = client.post("/api/ai/ocr", json={"image_base64": _b64_from_pil(img)})
    assert resp.status_code == 200
    assert resp.json().get("text", "") == ""


def test_face_not_found(client):
    img = Image.new("RGB", (160, 120), (50, 120, 180))
    resp = client.post("/api/ai/face-restore", json={"image_base64": _b64_from_pil(img)})
    assert resp.status_code == 400
    body = resp.json()
    detail = body.get("detail")
    if isinstance(detail, dict):
        assert detail.get("error") == "Face not detected"
    else:
        assert detail == "Face not detected"


def test_face_restore_pipeline(client, monkeypatch):
    import app.api.routes as routes

    sample = Image.new("RGB", (80, 80), "gray")
    sample_b64 = _b64_from_pil(sample)
    monkeypatch.setattr(routes, "_run_face_restore", lambda _img: {"image_base64": sample_b64, "bbox": [10, 10, 30, 30]})

    img = Image.new("RGB", (120, 120), "black")
    resp = client.post("/api/ai/face-restore", json={"image_base64": _b64_from_pil(img)})
    assert resp.status_code == 200
    image_b64 = resp.json().get("image_base64")
    assert isinstance(image_b64, str) and image_b64
    decoded = _decode_png_b64(image_b64)
    assert decoded.size[0] > 0 and decoded.size[1] > 0


def test_sam2_memory_leak_contract(client):
    import torch

    init_resp = client.post("/api/ai/track-init", json={"video_id": "vid-1"})
    assert init_resp.status_code == 200
    state_id = init_resp.json()["inference_state_id"]

    add = client.post("/api/ai/track-add-prompt", json={
        "inference_state_id": state_id,
        "frame_num": 0,
        "point": [120, 80],
    })
    assert add.status_code == 200

    before = torch.cuda.memory_allocated() if torch.cuda.is_available() else None
    cleanup = client.delete(f"/api/ai/track-cleanup/{state_id}")
    assert cleanup.status_code == 200

    if torch.cuda.is_available():
        after = torch.cuda.memory_allocated()
        assert after <= before

    missing = client.get(f"/api/ai/track-mask/{state_id}/0")
    assert missing.status_code == 404
