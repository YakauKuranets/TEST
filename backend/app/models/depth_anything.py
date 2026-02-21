"""
Depth Anything v2 — monocular depth estimation.

Produces a depth map from a single RGB image. Useful for 3D reconstruction,
depth-based effects, perspective analysis, and distance estimation in
forensic scenarios.

Fallback: simple Laplacian-based pseudo-depth when the model is absent.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import torch

from .model_paths import model_path

logger = logging.getLogger(__name__)


class DepthAnything:
    """Wrapper for monocular depth estimation."""

    def __init__(self, weights_path: str, device: str = "cuda"):
        self.device = device
        self.model = self._load(weights_path)

    def _load(self, weights_path: str):
        try:
            from transformers import AutoModelForDepthEstimation, AutoImageProcessor

            self.processor = AutoImageProcessor.from_pretrained(weights_path)
            model = AutoModelForDepthEstimation.from_pretrained(weights_path)
            model = model.to(self.device).eval()
            logger.info("Depth-Anything-v2 loaded (transformers)")
            return model
        except Exception as exc:
            logger.warning("Depth-Anything unavailable (%s), using Laplacian fallback", exc)
            self.processor = None
            return None

    def estimate(self, image: np.ndarray) -> np.ndarray:
        """
        Estimate depth map from RGB image.

        Args:
            image: (H,W,3) uint8 RGB.

        Returns:
            (H,W) float32 depth map normalised to 0-1.
        """
        if self.model is not None and self.processor is not None:
            return self._estimate_model(image)
        return self._estimate_laplacian(image)

    def depth_colormap(self, image: np.ndarray) -> np.ndarray:
        """Return a colourised depth map as (H,W,3) uint8 RGB."""
        depth = self.estimate(image)
        depth_u8 = (depth * 255).clip(0, 255).astype(np.uint8)
        try:
            import cv2
            return cv2.applyColorMap(depth_u8, cv2.COLORMAP_INFERNO)[:, :, ::-1]
        except ImportError:
            # Manual hot colormap
            r = depth_u8
            g = (depth_u8 * 0.5).astype(np.uint8)
            b = (255 - depth_u8).astype(np.uint8)
            return np.stack([r, g, b], axis=-1)

    def _estimate_model(self, image):
        from PIL import Image as PILImage

        pil_img = PILImage.fromarray(image)
        inputs = self.processor(images=pil_img, return_tensors="pt").to(self.device)
        with torch.no_grad():
            outputs = self.model(**inputs)
            depth = outputs.predicted_depth

        depth = torch.nn.functional.interpolate(
            depth.unsqueeze(1),
            size=image.shape[:2],
            mode="bicubic",
            align_corners=False,
        ).squeeze()

        depth_np = depth.cpu().numpy()
        depth_np = (depth_np - depth_np.min()) / (depth_np.max() - depth_np.min() + 1e-8)
        return depth_np.astype(np.float32)

    @staticmethod
    def _estimate_laplacian(image):
        try:
            import cv2
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY).astype(np.float32)
            blurred = cv2.GaussianBlur(gray, (0, 0), sigmaX=5)
            norm = (blurred - blurred.min()) / (blurred.max() - blurred.min() + 1e-8)
            return norm.astype(np.float32)
        except ImportError:
            gray = np.mean(image.astype(np.float32), axis=2)
            return (gray / 255.0).astype(np.float32)


def load_depth_anything(device: str = "cuda") -> DepthAnything:
    weights = model_path("depth_anything_v2")
    return DepthAnything(str(weights), device)
