import sys
from pathlib import Path
from io import BytesIO
import base64
import types

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Lightweight cv2 stub for headless CI where OpenCV shared libs are unavailable.
cv2_stub = types.SimpleNamespace(
    COLOR_RGB2BGR=0,
    COLOR_BGR2RGB=1,
    INTER_LINEAR=1,
)
cv2_stub.cvtColor = lambda arr, code: arr[..., ::-1] if getattr(arr, "ndim", 0) == 3 else arr
cv2_stub.split = lambda arr: [arr[..., i] for i in range(arr.shape[2])] if arr.ndim == 3 else [arr]
cv2_stub.merge = lambda channels: np.stack(channels, axis=2)


def _motion_kernel(length, angle):
    n = max(3, int(length))
    if n % 2 == 0:
        n += 1
    k = np.zeros((n, n), dtype=np.float32)
    k[n // 2, :] = 1.0
    k /= max(k.sum(), 1.0)
    return k


def _convolve2d_same(image, kernel):
    kh, kw = kernel.shape
    pad_h, pad_w = kh // 2, kw // 2
    padded = np.pad(image, ((pad_h, pad_h), (pad_w, pad_w)), mode="edge")
    out = np.zeros_like(image, dtype=np.float32)
    for y in range(image.shape[0]):
        for x in range(image.shape[1]):
            region = padded[y:y + kh, x:x + kw]
            out[y, x] = float(np.sum(region * kernel))
    return out


cv2_stub.getRotationMatrix2D = lambda center, angle, scale: np.array([[1, 0, 0], [0, 1, 0]], dtype=np.float32)
cv2_stub.warpAffine = lambda kernel, rot, size, flags=1: kernel
cv2_stub.filter2D = lambda img, ddepth, kernel: _convolve2d_same(img, kernel).astype(np.uint8)

sys.modules.setdefault("cv2", cv2_stub)

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.models.forensic import wiener_deconvolution


def _to_b64(img_np: np.ndarray) -> str:
    pil = Image.fromarray(img_np)
    buf = BytesIO()
    pil.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _from_b64(s: str) -> np.ndarray:
    raw = base64.b64decode(s)
    img = Image.open(BytesIO(raw)).convert("L")
    return np.array(img)


def test_math_core_wiener_restores_peak():
    src = np.zeros((31, 31), dtype=np.uint8)
    src[15, 15] = 255

    kernel = _motion_kernel(length=15, angle=0)
    blurred = cv2_stub.filter2D(src, -1, kernel)
    restored = wiener_deconvolution(blurred, length=15, angle=0, nsr=0.01)

    center_val = int(restored[15, 15])
    noise_floor = float(np.mean(restored))

    assert center_val >= 200
    assert (center_val / max(noise_floor, 1.0)) >= 5.0


def test_endpoint_json_returns_base64_result():
    client = TestClient(app)
    img = np.zeros((24, 24), dtype=np.uint8)
    img[10:14, 8:16] = 180
    payload = {
        "base64_image": _to_b64(img),
        "length": 15,
        "angle": 45,
    }

    resp = client.post("/api/forensic/deblur", json=payload)
    assert resp.status_code == 200

    body = resp.json()
    assert isinstance(body.get("result"), str)
    decoded = _from_b64(body["result"])
    assert decoded.shape == img.shape


def test_endpoint_validation_negative_length():
    client = TestClient(app)
    img = np.zeros((20, 20), dtype=np.uint8)
    payload = {
        "base64_image": _to_b64(img),
        "length": -5,
        "angle": 15,
    }

    resp = client.post("/api/forensic/deblur", json=payload)
    assert resp.status_code == 422
