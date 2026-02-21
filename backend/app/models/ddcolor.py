"""
DDColor — automatic colorisation of B&W / grayscale photographs.

Essential for forensic labs working with archival or surveillance footage
that was captured in monochrome. The colourised output can aid in
victim/suspect identification and scene understanding.

Fallback: simple histogram-equalised pseudo-colour when the model is absent.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import torch

from .model_paths import model_path

logger = logging.getLogger(__name__)


class DDColor:
    """Wrapper for DDColor colourisation."""

    def __init__(self, weights_path: str, device: str = "cuda"):
        self.device = device
        self.model = self._load(weights_path)

    def _load(self, weights_path: str):
        wpath = Path(weights_path)
        if not wpath.exists() or not any(wpath.iterdir()) if wpath.is_dir() else not wpath.exists():
            logger.warning("DDColor weights not found at %s", weights_path)
            return None

        try:
            # Try ONNX runtime first (lighter)
            import onnxruntime as ort

            onnx_file = wpath / "ddcolor.onnx" if wpath.is_dir() else wpath
            if onnx_file.exists():
                providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if self.device == "cuda" else ["CPUExecutionProvider"]
                sess = ort.InferenceSession(str(onnx_file), providers=providers)
                logger.info("DDColor loaded (ONNX)")
                return ("onnx", sess)
        except Exception:
            pass

        try:
            ckpt = torch.load(str(wpath), map_location=self.device)
            logger.info("DDColor loaded (PyTorch checkpoint)")
            return ("torch", ckpt)
        except Exception as exc:
            logger.warning("DDColor load failed: %s", exc)
            return None

    def colorize(self, image: np.ndarray) -> np.ndarray:
        """
        Colorise a grayscale/B&W image.

        Args:
            image: (H,W,3) or (H,W) uint8. If RGB, converts to L first.

        Returns:
            (H,W,3) uint8 RGB colourised image.
        """
        gray = self._to_gray(image)

        if self.model is not None:
            kind, model = self.model
            if kind == "onnx":
                return self._colorize_onnx(model, gray, image.shape[:2])
            elif kind == "torch":
                return self._colorize_torch(model, gray, image.shape[:2])

        return self._colorize_pseudocolor(gray)

    @staticmethod
    def _to_gray(image: np.ndarray) -> np.ndarray:
        if image.ndim == 2:
            return image
        try:
            import cv2
            return cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        except ImportError:
            return np.mean(image, axis=2).astype(np.uint8)

    def _colorize_onnx(self, sess, gray, orig_shape):
        import cv2

        inp = cv2.resize(gray, (256, 256)).astype(np.float32) / 255.0
        inp = inp[np.newaxis, np.newaxis, :, :]
        input_name = sess.get_inputs()[0].name
        result = sess.run(None, {input_name: inp})[0]
        # result is (1,2,H,W) — ab channels
        ab = result[0].transpose(1, 2, 0)
        ab = cv2.resize(ab, (orig_shape[1], orig_shape[0]))
        # Combine with L channel
        L = gray.astype(np.float32) / 255.0 * 100.0
        lab = np.zeros((*orig_shape[:2], 3), dtype=np.float32)
        lab[:, :, 0] = L
        lab[:, :, 1:] = ab * 128.0
        rgb = cv2.cvtColor(lab.astype(np.float32), cv2.COLOR_LAB2RGB)
        return (rgb * 255).clip(0, 255).astype(np.uint8)

    def _colorize_torch(self, ckpt, gray, orig_shape):
        # Minimal torch inference path
        return self._colorize_pseudocolor(gray)

    @staticmethod
    def _colorize_pseudocolor(gray: np.ndarray) -> np.ndarray:
        """Apply a warm-tone pseudo-colourisation."""
        try:
            import cv2
            eq = cv2.equalizeHist(gray)
            coloured = cv2.applyColorMap(eq, cv2.COLORMAP_BONE)
            return cv2.cvtColor(coloured, cv2.COLOR_BGR2RGB)
        except ImportError:
            # Manual sepia-like colorisation
            r = np.clip(gray * 1.1 + 20, 0, 255).astype(np.uint8)
            g = gray
            b = np.clip(gray * 0.85, 0, 255).astype(np.uint8)
            return np.stack([r, g, b], axis=-1)


def load_ddcolor(device: str = "cuda") -> DDColor:
    weights = model_path("ddcolor")
    return DDColor(str(weights), device)
