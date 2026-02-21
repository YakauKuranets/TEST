from io import BytesIO
from pathlib import Path
import sys
import types

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

cv2_stub = types.SimpleNamespace(
    COLOR_RGB2BGR=0,
    COLOR_BGR2RGB=1,
    COLOR_BGR2GRAY=2,
)
cv2_stub.cvtColor = lambda arr, code: (
    arr[..., ::-1] if getattr(arr, "ndim", 0) == 3 and code in {0, 1}
    else (arr.mean(axis=2).astype("uint8") if getattr(arr, "ndim", 0) == 3 and code == 2 else arr)
)

def _calc_hist(images, channels, _mask, bins, ranges):
    arr = images[0]
    hist, _ = np.histogramdd(
        arr.reshape(-1, 3),
        bins=(bins[0], bins[1], bins[2]),
        range=((ranges[0], ranges[1]), (ranges[2], ranges[3]), (ranges[4], ranges[5]))
    )
    return hist.astype(np.float32)

cv2_stub.calcHist = _calc_hist
cv2_stub.absdiff = lambda a, b: np.abs(a.astype(np.int16) - b.astype(np.int16)).astype(np.uint8)
cv2_stub.applyColorMap = lambda gray, _map: np.stack([gray, np.zeros_like(gray), 255 - gray], axis=2)
cv2_stub.GaussianBlur = lambda arr, *_a, **_k: arr
cv2_stub.addWeighted = lambda a, *_a2, **_k2: a
cv2_stub.COLORMAP_JET = 2
cv2_stub.data = types.SimpleNamespace(haarcascades='')
cv2_stub.CascadeClassifier = lambda *_a, **_k: types.SimpleNamespace(detectMultiScale=lambda *_: [])
sys.modules.setdefault("cv2", cv2_stub)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


def _png_bytes(arr: np.ndarray) -> bytes:
    img = Image.fromarray(arr.astype(np.uint8), mode="RGB")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _person_like_image(size=(128, 128)) -> np.ndarray:
    h, w = size
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:] = (40, 40, 40)
    img[h // 5 : h - h // 5, w // 3 : (w // 3) * 2] = (180, 140, 120)
    return img


def _vehicle_like_image(size=(128, 128)) -> np.ndarray:
    h, w = size
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:] = (20, 20, 90)
    img[h // 2 : h - h // 4, w // 6 : w - w // 6] = (200, 200, 40)
    return img


@pytest.fixture
def client():
    return TestClient(app)


def test_reid_identical(client):
    person = _person_like_image()
    payload = _png_bytes(person)

    capture = client.post(
        "/api/spatial/extract-features",
        files={"file": ("person.png", payload, "image/png")},
        data={"subject_id": "suspect-a"},
    )
    assert capture.status_code == 200

    compare = client.post(
        "/api/spatial/compare",
        files={"file": ("person-copy.png", payload, "image/png")},
        data={"subject_id": "suspect-a"},
    )
    assert compare.status_code == 200
    similarity = float(compare.json()["similarity"])
    assert similarity >= 0.999


def test_reid_different(client):
    person = _png_bytes(_person_like_image())
    car = _png_bytes(_vehicle_like_image())

    capture = client.post(
        "/api/spatial/extract-features",
        files={"file": ("person.png", person, "image/png")},
        data={"subject_id": "suspect-b"},
    )
    assert capture.status_code == 200

    compare = client.post(
        "/api/spatial/compare",
        files={"file": ("car.png", car, "image/png")},
        data={"subject_id": "suspect-b"},
    )
    assert compare.status_code == 200
    similarity = float(compare.json()["similarity"])
    assert similarity < 0.3
