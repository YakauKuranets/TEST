"""
SAM 2 (Segment Anything Model) — one-click object segmentation.

Produces per-pixel segmentation masks from point/box prompts or
fully-automatic mode. Critical for forensic evidence isolation,
background removal, and object extraction from crime scene imagery.

Fallback: GrabCut (OpenCV) when SAM weights are absent.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import numpy as np
import torch

from .model_paths import model_path

logger = logging.getLogger(__name__)


class SegmentAnything:
    """Wrapper for SAM 2 segmentation."""

    def __init__(self, weights_path: str, device: str = "cuda"):
        self.device = device
        self.model = None
        self.processor = None
        self._load(weights_path)

    def _load(self, weights_path: str):
        try:
            from transformers import SamModel, SamProcessor

            self.processor = SamProcessor.from_pretrained(weights_path)
            self.model = SamModel.from_pretrained(weights_path).to(self.device).eval()
            logger.info("SAM-2 loaded (transformers)")
        except Exception as exc:
            logger.warning("SAM-2 unavailable (%s), using GrabCut fallback", exc)

    def segment_point(
        self,
        image: np.ndarray,
        points: list[tuple[int, int]],
        labels: Optional[list[int]] = None,
    ) -> np.ndarray:
        """
        Segment object(s) indicated by point prompts.

        Args:
            image: (H,W,3) uint8 RGB.
            points: [(x,y), ...] — foreground clicks.
            labels: 1=foreground, 0=background per point. Defaults to all-foreground.

        Returns:
            (H,W) bool mask.
        """
        if labels is None:
            labels = [1] * len(points)

        if self.model is not None and self.processor is not None:
            return self._segment_sam(image, points, labels)
        return self._segment_grabcut(image, points)

    def segment_box(self, image: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
        """Segment within a bounding box (x1, y1, x2, y2)."""
        if self.model is not None and self.processor is not None:
            return self._segment_sam_box(image, box)
        cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
        return self._segment_grabcut(image, [(cx, cy)])

    def segment_auto(self, image: np.ndarray, num_points: int = 32) -> list[np.ndarray]:
        """
        Automatic segmentation — generate masks for all objects.

        Returns:
            List of (H,W) bool masks.
        """
        if self.model is not None:
            return self._segment_auto_sam(image, num_points)
        # Fallback: return single threshold-based mask
        try:
            import cv2
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            return [mask.astype(bool)]
        except ImportError:
            return [np.ones(image.shape[:2], dtype=bool)]

    # ------------------------------------------------------------------
    def _segment_sam(self, image, points, labels):
        from PIL import Image as PILImage

        pil_img = PILImage.fromarray(image)
        input_points = [points]
        input_labels = [labels]

        inputs = self.processor(
            pil_img,
            input_points=input_points,
            input_labels=input_labels,
            return_tensors="pt",
        ).to(self.device)

        with torch.no_grad():
            outputs = self.model(**inputs)

        masks = self.processor.image_processor.post_process_masks(
            outputs.pred_masks.cpu(),
            inputs["original_sizes"].cpu(),
            inputs["reshaped_input_sizes"].cpu(),
        )
        return masks[0][0][0].numpy().astype(bool)

    def _segment_sam_box(self, image, box):
        from PIL import Image as PILImage

        pil_img = PILImage.fromarray(image)
        inputs = self.processor(
            pil_img,
            input_boxes=[[[box[0], box[1], box[2], box[3]]]],
            return_tensors="pt",
        ).to(self.device)

        with torch.no_grad():
            outputs = self.model(**inputs)

        masks = self.processor.image_processor.post_process_masks(
            outputs.pred_masks.cpu(),
            inputs["original_sizes"].cpu(),
            inputs["reshaped_input_sizes"].cpu(),
        )
        return masks[0][0][0].numpy().astype(bool)

    def _segment_auto_sam(self, image, num_points):
        h, w = image.shape[:2]
        step_h = h // int(num_points ** 0.5)
        step_w = w // int(num_points ** 0.5)
        points = []
        for y in range(step_h // 2, h, step_h):
            for x in range(step_w // 2, w, step_w):
                points.append((x, y))

        masks = []
        for pt in points[:num_points]:
            try:
                m = self.segment_point(image, [pt])
                if m.any():
                    masks.append(m)
            except Exception:
                continue
        return masks

    @staticmethod
    def _segment_grabcut(image, points):
        try:
            import cv2

            h, w = image.shape[:2]
            mask = np.zeros((h, w), dtype=np.uint8)
            bgd = np.zeros((1, 65), np.float64)
            fgd = np.zeros((1, 65), np.float64)

            if points:
                cx, cy = points[0]
                pad = min(w, h) // 4
                rect = (
                    max(0, cx - pad),
                    max(0, cy - pad),
                    min(w - 1, cx + pad) - max(0, cx - pad),
                    min(h - 1, cy + pad) - max(0, cy - pad),
                )
            else:
                rect = (10, 10, w - 20, h - 20)

            bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
            cv2.grabCut(bgr, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
            return ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(bool)
        except Exception as exc:
            logger.error("GrabCut fallback failed: %s", exc)
            return np.ones(image.shape[:2], dtype=bool)


def load_segment_anything(device: str = "cuda") -> SegmentAnything:
    weights = model_path("sam2")
    return SegmentAnything(str(weights), device)
