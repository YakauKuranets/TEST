"""
PaddleOCR — text detection & recognition on images.

Extracts licence plates, signage, documents, handwritten notes from
evidence imagery. Returns bounding boxes + text + confidence for each
detected text region.

Fallback: Tesseract OCR or empty results.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

from .model_paths import model_path

logger = logging.getLogger(__name__)


class OCREngine:
    """Wrapper for multi-engine OCR."""

    def __init__(self, weights_dir: str, device: str = "cuda"):
        self.device = device
        self.engine = self._load(weights_dir)

    def _load(self, weights_dir):
        # Try PaddleOCR first
        try:
            from paddleocr import PaddleOCR

            ocr = PaddleOCR(
                use_angle_cls=True,
                lang="en",
                det_model_dir=weights_dir + "/det" if weights_dir else None,
                rec_model_dir=weights_dir + "/rec" if weights_dir else None,
                use_gpu=self.device == "cuda",
                show_log=False,
            )
            logger.info("PaddleOCR loaded")
            return ("paddle", ocr)
        except Exception as exc:
            logger.warning("PaddleOCR unavailable (%s)", exc)

        # Fallback: EasyOCR
        try:
            import easyocr

            reader = easyocr.Reader(["en", "ru"], gpu=self.device == "cuda")
            logger.info("EasyOCR loaded (fallback)")
            return ("easyocr", reader)
        except Exception as exc:
            logger.warning("EasyOCR unavailable (%s)", exc)

        # Fallback: pytesseract
        try:
            import pytesseract

            pytesseract.get_tesseract_version()
            logger.info("Tesseract loaded (fallback)")
            return ("tesseract", pytesseract)
        except Exception as exc:
            logger.warning("Tesseract unavailable (%s)", exc)

        return None

    def recognize(self, image: np.ndarray) -> list[dict[str, Any]]:
        """
        Detect and recognise text in image.

        Args:
            image: (H,W,3) uint8 RGB.

        Returns:
            List of dicts with keys: bbox, text, confidence.
        """
        if self.engine is None:
            return []

        kind, engine = self.engine
        if kind == "paddle":
            return self._ocr_paddle(engine, image)
        elif kind == "easyocr":
            return self._ocr_easyocr(engine, image)
        elif kind == "tesseract":
            return self._ocr_tesseract(engine, image)
        return []

    def recognize_rendered(self, image: np.ndarray) -> np.ndarray:
        """Return image with detected text regions highlighted."""
        results = self.recognize(image)
        output = image.copy()
        try:
            import cv2
            for r in results:
                box = r.get("bbox", {})
                x, y, w, h = box.get("x", 0), box.get("y", 0), box.get("w", 0), box.get("h", 0)
                cv2.rectangle(output, (x, y), (x + w, y + h), (0, 255, 0), 2)
                text = r.get("text", "")
                conf = r.get("confidence", 0)
                label = f"{text} ({conf:.0%})"
                cv2.putText(output, label, (x, max(y - 5, 15)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        except ImportError:
            pass
        return output

    @staticmethod
    def _ocr_paddle(ocr, image):
        try:
            import cv2
            bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
        except ImportError:
            bgr = image[:, :, ::-1].copy()

        result = ocr.ocr(bgr, cls=True)
        detections = []
        if result and result[0]:
            for line in result[0]:
                box_pts, (text, conf) = line[0], line[1]
                xs = [p[0] for p in box_pts]
                ys = [p[1] for p in box_pts]
                detections.append({
                    "bbox": {
                        "x": int(min(xs)),
                        "y": int(min(ys)),
                        "w": int(max(xs) - min(xs)),
                        "h": int(max(ys) - min(ys)),
                    },
                    "text": text,
                    "confidence": float(conf),
                    "polygon": [[int(p[0]), int(p[1])] for p in box_pts],
                })
        return detections

    @staticmethod
    def _ocr_easyocr(reader, image):
        results = reader.readtext(image)
        detections = []
        for (box_pts, text, conf) in results:
            xs = [p[0] for p in box_pts]
            ys = [p[1] for p in box_pts]
            detections.append({
                "bbox": {
                    "x": int(min(xs)),
                    "y": int(min(ys)),
                    "w": int(max(xs) - min(xs)),
                    "h": int(max(ys) - min(ys)),
                },
                "text": text,
                "confidence": float(conf),
            })
        return detections

    @staticmethod
    def _ocr_tesseract(tess, image):
        from PIL import Image as PILImage
        pil_img = PILImage.fromarray(image)
        data = tess.image_to_data(pil_img, output_type=tess.Output.DICT)
        detections = []
        n = len(data.get("text", []))
        for i in range(n):
            text = data["text"][i].strip()
            conf = int(data["conf"][i])
            if text and conf > 30:
                detections.append({
                    "bbox": {
                        "x": int(data["left"][i]),
                        "y": int(data["top"][i]),
                        "w": int(data["width"][i]),
                        "h": int(data["height"][i]),
                    },
                    "text": text,
                    "confidence": conf / 100.0,
                })
        return detections


def load_ocr(device: str = "cuda") -> OCREngine:
    weights = model_path("paddleocr")
    return OCREngine(str(weights), device)
