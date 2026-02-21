import base64
from io import BytesIO
from pathlib import Path
import sys
import types

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

cv2_stub = types.SimpleNamespace(
    COLOR_RGB2BGR=0,
    COLOR_BGR2RGB=1,
    COLOR_BGR2GRAY=2,
    INTER_LINEAR=1,
    cvtColor=lambda arr, code: (arr[..., ::-1] if getattr(arr, 'ndim', 0) == 3 and code in {0, 1} else (arr.mean(axis=2).astype('uint8') if getattr(arr, 'ndim', 0) == 3 else arr)),
    split=lambda arr: [arr[..., i] for i in range(arr.shape[2])] if getattr(arr, 'ndim', 0) == 3 else [arr],
    merge=lambda channels: np.stack(channels, axis=2),
    GaussianBlur=lambda arr, *_a, **_k: arr,
    addWeighted=lambda a, *_a2, **_k2: a,
    data=types.SimpleNamespace(haarcascades=''),
    CascadeClassifier=lambda *_a, **_k: types.SimpleNamespace(detectMultiScale=lambda *_: []),
)
sys.modules.setdefault('cv2', cv2_stub)

from app.main import app


def img_to_b64(arr: np.ndarray) -> str:
    img = Image.fromarray(arr.astype(np.uint8), mode='RGB')
    buf = BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('ascii')


def b64_to_img(b64s: str) -> Image.Image:
    raw = base64.b64decode(b64s)
    return Image.open(BytesIO(raw))


@pytest.fixture
def client():
    return TestClient(app)


def test_temporal_valid(client):
    base = np.full((64, 64, 3), 120, dtype=np.uint8)
    frames = [img_to_b64(np.clip(base + i, 0, 255).astype(np.uint8)) for i in range(5)]

    resp = client.post('/api/video/temporal-denoise', json={'frames_base64': frames})
    assert resp.status_code == 200

    result_b64 = resp.json().get('result')
    assert isinstance(result_b64, str) and result_b64
    out = b64_to_img(result_b64)
    assert out.size == (64, 64)


def test_temporal_mismatch(client):
    f1 = img_to_b64(np.zeros((108, 192, 3), dtype=np.uint8))
    f2 = img_to_b64(np.zeros((60, 80, 3), dtype=np.uint8))
    frames = [f1, f1, f2, f1, f1]

    resp = client.post('/api/video/temporal-denoise', json={'frames_base64': frames})
    assert resp.status_code == 400
    assert 'Разрешение кадров не совпадает' in resp.text


def test_temporal_math(client):
    rng = np.random.default_rng(42)
    clean = np.full((72, 72, 3), 90, dtype=np.float32)

    noisy_frames = []
    variances = []
    for _ in range(5):
        noise = rng.normal(0, 25, size=clean.shape)
        frame = np.clip(clean + noise, 0, 255).astype(np.uint8)
        noisy_frames.append(frame)
        variances.append(float(np.var(frame.astype(np.float32))))

    resp = client.post('/api/video/temporal-denoise', json={'frames_base64': [img_to_b64(f) for f in noisy_frames]})
    assert resp.status_code == 200

    out = np.array(b64_to_img(resp.json()['result']).convert('RGB')).astype(np.float32)
    out_var = float(np.var(out))
    assert out_var < min(variances)
