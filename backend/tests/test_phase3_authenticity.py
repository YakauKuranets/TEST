import base64
import hashlib
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
    COLOR_GRAY2BGR=3,
    INTER_LINEAR=1,
    COLORMAP_JET=2,
)
cv2_stub.cvtColor = lambda arr, code: (
    arr[..., ::-1] if getattr(arr, 'ndim', 0) == 3 and code in {0, 1}
    else (arr.mean(axis=2).astype('uint8') if getattr(arr, 'ndim', 0) == 3 and code == 2
          else (np.stack([arr, arr, arr], axis=2) if getattr(arr, 'ndim', 0) == 2 and code == 3 else arr))
)
cv2_stub.absdiff = lambda a, b: np.abs(a.astype(np.int16) - b.astype(np.int16)).astype(np.uint8)
cv2_stub.applyColorMap = lambda gray, _map: np.stack([gray, np.zeros_like(gray), 255 - gray], axis=2)
cv2_stub.GaussianBlur = lambda arr, *_a, **_k: arr
cv2_stub.addWeighted = lambda a, *_a2, **_k2: a
cv2_stub.data = types.SimpleNamespace(haarcascades='')
cv2_stub.CascadeClassifier = lambda *_a, **_k: types.SimpleNamespace(detectMultiScale=lambda *_: [])
sys.modules.setdefault('cv2', cv2_stub)

from app.main import app


def img_bytes(mode='RGB', size=(128, 96), fill=(120, 120, 120), fmt='PNG'):
    img = Image.new(mode, size, fill)
    buf = BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


def gradient_png_bytes(w=256, h=128):
    x = np.linspace(0, 255, w, dtype=np.uint8)
    grad = np.tile(x, (h, 1))
    arr = np.stack([grad, grad, grad], axis=2)
    img = Image.fromarray(arr, mode='RGB')
    b = BytesIO()
    img.save(b, format='PNG')
    return b.getvalue()


@pytest.fixture
def client():
    return TestClient(app)


def test_ela_math_strict(client):
    data = gradient_png_bytes()
    files = {'file': ('g.png', data, 'image/png')}
    r1 = client.post('/api/forensic/ela', files=files)
    r2 = client.post('/api/forensic/ela', files=files)
    assert r1.status_code == 200
    assert r2.status_code == 200

    b64_1 = base64.b64encode(r1.content).decode('ascii')
    b64_2 = base64.b64encode(r2.content).decode('ascii')
    assert hashlib.md5(b64_1.encode()).hexdigest() == hashlib.md5(b64_2.encode()).hexdigest()


def test_ela_alpha_channel(client):
    rgba = Image.new('RGBA', (120, 80), (0, 0, 0, 0))
    buf = BytesIO(); rgba.save(buf, format='PNG')
    files = {'file': ('alpha.png', buf.getvalue(), 'image/png')}
    resp = client.post('/api/forensic/ela', files=files)
    assert resp.status_code == 200
    assert len(resp.content) > 0


def test_ela_empty_file(client):
    files = {'file': ('empty.png', b'', 'image/png')}
    resp = client.post('/api/forensic/ela', files=files)
    assert resp.status_code == 422


def test_deepfake_boundaries(client, monkeypatch):
    import app.api.routes as routes

    monkeypatch.setattr(routes, '_run_deepfake_model', lambda _img: {'probability': 1.5, 'is_fake': True, 'heatmap': ''})
    files = {'file': ('img.png', img_bytes(), 'image/png')}
    resp = client.post('/api/forensic/deepfake-detect', files=files)
    assert resp.status_code == 200
    p = float(resp.json().get('probability'))
    assert 0.0 <= p <= 1.0
    assert p == 1.0


def test_deepfake_no_face(client):
    asphalt = np.zeros((200, 300, 3), dtype=np.uint8)
    asphalt[..., 0] = 90
    asphalt[..., 1] = 90
    asphalt[..., 2] = 90
    img = Image.fromarray(asphalt, mode='RGB')
    buf = BytesIO(); img.save(buf, format='PNG')
    files = {'file': ('asphalt.png', buf.getvalue(), 'image/png')}
    resp = client.post('/api/forensic/deepfake-detect', files=files)
    assert resp.status_code == 400
    assert 'No face detected for deepfake analysis' in resp.text


def test_deepfake_vram_clear(client):
    import torch

    big = img_bytes(size=(3840, 2160), fill=(100, 120, 130))
    files = {'file': ('4k.png', big, 'image/png')}

    before = torch.cuda.memory_allocated() if torch.cuda.is_available() else None
    for _ in range(5):
        r = client.post('/api/forensic/deepfake-detect', files=files)
        assert r.status_code in {200, 400}

    if torch.cuda.is_available():
        after = torch.cuda.memory_allocated()
        assert after <= before
