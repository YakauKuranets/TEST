"""
InsightFace — face identification, verification & attribute analysis.

Goes beyond detection: generates face embeddings for identity matching,
computes similarity scores between faces, estimates age/gender/expression.
Critical for suspect identification across multiple evidence sources.

Fallback: basic face detection + histogram-based pseudo-embedding.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

import numpy as np

from .model_paths import model_path

logger = logging.getLogger(__name__)


class FaceID:
    """Wrapper for InsightFace recognition pipeline."""

    EMBEDDING_DIM = 512

    def __init__(self, weights_dir: str, device: str = "cuda"):
        self.device = device
        self.app = self._load(weights_dir)

    def _load(self, weights_dir):
        try:
            from insightface.app import FaceAnalysis

            app = FaceAnalysis(
                name="buffalo_l",
                root=weights_dir,
                providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
                if self.device == "cuda"
                else ["CPUExecutionProvider"],
            )
            app.prepare(ctx_id=0 if self.device == "cuda" else -1, det_size=(640, 640))
            logger.info("InsightFace loaded (buffalo_l)")
            return app
        except Exception as exc:
            logger.warning("InsightFace unavailable (%s), using OpenCV fallback", exc)
            return None

    def analyze(self, image: np.ndarray) -> list[dict[str, Any]]:
        """
        Detect faces and compute embeddings + attributes.

        Returns list of dicts per face:
            bbox, embedding (512-d), age, gender, det_score, landmarks.
        """
        if self.app is not None:
            return self._analyze_insight(image)
        return self._analyze_fallback(image)

    def compare(
        self,
        image_a: np.ndarray,
        image_b: np.ndarray,
    ) -> dict[str, Any]:
        """
        Compare faces between two images.

        Returns:
            similarity (0-1), match (bool), faces_a, faces_b counts.
        """
        faces_a = self.analyze(image_a)
        faces_b = self.analyze(image_b)

        if not faces_a or not faces_b:
            return {
                "similarity": 0.0,
                "match": False,
                "faces_a": len(faces_a),
                "faces_b": len(faces_b),
                "pairs": [],
            }

        pairs = []
        for i, fa in enumerate(faces_a):
            emb_a = np.array(fa.get("embedding", []))
            if emb_a.size == 0:
                continue
            for j, fb in enumerate(faces_b):
                emb_b = np.array(fb.get("embedding", []))
                if emb_b.size == 0:
                    continue
                sim = float(self._cosine_sim(emb_a, emb_b))
                pairs.append({
                    "face_a": i,
                    "face_b": j,
                    "similarity": sim,
                    "match": sim > 0.4,
                })

        best_sim = max((p["similarity"] for p in pairs), default=0.0)
        return {
            "similarity": best_sim,
            "match": best_sim > 0.4,
            "faces_a": len(faces_a),
            "faces_b": len(faces_b),
            "pairs": pairs,
        }

    def get_embedding(self, image: np.ndarray) -> Optional[list[float]]:
        """Get embedding of the largest face in image."""
        faces = self.analyze(image)
        if not faces:
            return None
        # Pick largest face
        largest = max(faces, key=lambda f: f["bbox"]["w"] * f["bbox"]["h"])
        return largest.get("embedding")

    @staticmethod
    def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))

    def _analyze_insight(self, image):
        try:
            import cv2
            bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
        except ImportError:
            bgr = image[:, :, ::-1].copy()

        faces = self.app.get(bgr)
        results = []
        for face in faces:
            bbox = face.bbox.astype(int)
            results.append({
                "bbox": {
                    "x": int(bbox[0]),
                    "y": int(bbox[1]),
                    "w": int(bbox[2] - bbox[0]),
                    "h": int(bbox[3] - bbox[1]),
                },
                "embedding": face.embedding.tolist() if face.embedding is not None else [],
                "det_score": float(face.det_score) if hasattr(face, "det_score") else 0.0,
                "age": int(face.age) if hasattr(face, "age") and face.age else None,
                "gender": ("M" if face.gender == 1 else "F") if hasattr(face, "gender") and face.gender is not None else None,
                "landmarks": face.kps.tolist() if hasattr(face, "kps") and face.kps is not None else [],
            })
        return results

    def _analyze_fallback(self, image):
        """OpenCV Haar cascade detection + histogram pseudo-embedding."""
        try:
            import cv2

            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )
            detections = cascade.detectMultiScale(gray, 1.1, 5)
            results = []
            for (x, y, w, h) in detections:
                face_crop = gray[y : y + h, x : x + w]
                face_resized = cv2.resize(face_crop, (32, 16))
                emb = face_resized.flatten().astype(np.float32)
                emb = emb / (np.linalg.norm(emb) + 1e-8)
                # Pad to 512
                full_emb = np.zeros(self.EMBEDDING_DIM, dtype=np.float32)
                full_emb[: len(emb)] = emb
                results.append({
                    "bbox": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
                    "embedding": full_emb.tolist(),
                    "det_score": 0.75,
                    "age": None,
                    "gender": None,
                    "landmarks": [],
                })
            return results
        except Exception as exc:
            logger.error("Face ID fallback failed: %s", exc)
            return []


def load_face_id(device: str = "cuda") -> FaceID:
    weights = model_path("insightface")
    return FaceID(str(weights), device)
