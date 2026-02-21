import sys
from io import BytesIO
from pathlib import Path
import base64
import types

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

cv2_stub = types.SimpleNamespace(
    COLOR_RGB2BGR=0,
    COLOR_BGR2RGB=1,
    INTER_LINEAR=1,
)
cv2_stub.cvtColor = lambda arr, code: arr[..., ::-1] if getattr(arr, "ndim", 0) == 3 else arr
cv2_stub.split = lambda arr: [arr[..., i] for i in range(arr.shape[2])] if arr.ndim == 3 else [arr]
cv2_stub.merge = lambda channels: np.stack(channels, axis=2)
cv2_stub.GaussianBlur = lambda arr, *_a, **_k: arr
cv2_stub.addWeighted = lambda a, *_a2, **_k2: a
cv2_stub.data = types.SimpleNamespace(haarcascades="")
cv2_stub.CascadeClassifier = lambda *_a, **_k: types.SimpleNamespace(detectMultiScale=lambda *_: [])
sys.modules.setdefault("cv2", cv2_stub)

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


def b64_from_rgb(arr):
    img = Image.fromarray(arr.astype(np.uint8), mode="RGB")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_prerequisites_manifest_and_models_dir_ready():
    with TestClient(app) as client:
        resp = client.get('/api/system/models-config')
        assert resp.status_code == 200
        assert isinstance(resp.json(), dict)

    models_root = Path(r"D:\PLAYE\models")
    assert models_root.exists()
    assert (models_root / 'models_manifest.json').exists()


def test_detect_endpoint_returns_detections():
    client = TestClient(app)
    arr = np.zeros((64, 64, 3), dtype=np.uint8)
    arr[20:40, 10:50] = 200
    resp = client.post('/api/ai/detect', json={"image_base64": b64_from_rgb(arr)})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body.get('detections', [])) > 0


def test_ocr_endpoint_empty_text_safe_for_rotated_input():
    client = TestClient(app)
    arr = np.rot90(np.zeros((40, 100, 3), dtype=np.uint8) + 255)
    resp = client.post('/api/ai/ocr', json={"image_base64": b64_from_rgb(arr)})
    assert resp.status_code == 200
    body = resp.json()
    assert 'text' in body
    assert isinstance(body.get('text'), str)


def test_face_restore_no_face_returns_400():
    client = TestClient(app)
    arr = np.zeros((80, 80, 3), dtype=np.uint8)
    resp = client.post('/api/ai/face-restore', json={"image_base64": b64_from_rgb(arr)})
    assert resp.status_code == 400


def test_track_propagate_and_cleanup_contract():
    client = TestClient(app)
    init = client.post('/api/ai/track-init', json={"video_id": "v1"})
    track_id = init.json()['inference_state_id']

    add = client.post('/api/ai/track-add-prompt', json={"inference_state_id": track_id, "frame_num": 0, "point": [100, 80]})
    assert add.status_code == 200
    prop = client.post('/api/ai/track-propagate', json={"inference_state_id": track_id, "frames": 3})
    assert prop.status_code == 200

    m1 = client.get(f'/api/ai/track-mask/{track_id}/1')
    m2 = client.get(f'/api/ai/track-mask/{track_id}/2')
    m3 = client.get(f'/api/ai/track-mask/{track_id}/3')
    assert m1.status_code == 200 and len(m1.json().get('polygon', [])) >= 3
    assert m2.status_code == 200 and len(m2.json().get('polygon', [])) >= 3
    assert m3.status_code == 200 and len(m3.json().get('polygon', [])) >= 3

    cleanup = client.delete(f'/api/ai/track-cleanup/{track_id}')
    assert cleanup.status_code == 200
