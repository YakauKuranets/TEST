"""
RIFE / IFRNet — video frame interpolation.

Generates intermediate frames between two existing frames for:
- Slow-motion analysis of critical events
- FPS boost for low-framerate surveillance footage
- Temporal gap filling in corrupted video evidence

Fallback: OpenCV optical-flow-based linear blending.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import numpy as np
import torch

from .model_paths import model_path

logger = logging.getLogger(__name__)


class FrameInterpolator:
    """Wrapper for AI frame interpolation."""

    def __init__(self, weights_path: str, device: str = "cuda"):
        self.device = device
        self.model = self._load(weights_path)

    def _load(self, weights_path: str):
        wpath = Path(weights_path)

        # Try RIFE model
        try:
            if (wpath / "flownet.pkl").exists() or (wpath / "rife.pth").exists():
                # Import RIFE
                import importlib
                spec = importlib.util.find_spec("rife_model")
                if spec:
                    from rife_model import RIFE

                    model = RIFE(weights_path, device=self.device)
                    logger.info("RIFE loaded")
                    return ("rife", model)
        except Exception as exc:
            logger.warning("RIFE unavailable: %s", exc)

        # Try ONNX
        try:
            onnx_file = wpath / "rife.onnx" if wpath.is_dir() else wpath
            if onnx_file.exists():
                import onnxruntime as ort

                providers = (
                    ["CUDAExecutionProvider", "CPUExecutionProvider"]
                    if self.device == "cuda"
                    else ["CPUExecutionProvider"]
                )
                sess = ort.InferenceSession(str(onnx_file), providers=providers)
                logger.info("RIFE loaded (ONNX)")
                return ("onnx", sess)
        except Exception as exc:
            logger.warning("RIFE ONNX unavailable: %s", exc)

        logger.warning("Frame interpolation using optical-flow fallback")
        return None

    def interpolate(
        self,
        frame_a: np.ndarray,
        frame_b: np.ndarray,
        t: float = 0.5,
    ) -> np.ndarray:
        """
        Generate an intermediate frame at time *t* between frame_a and frame_b.

        Args:
            frame_a: (H,W,3) uint8 RGB — earlier frame.
            frame_b: (H,W,3) uint8 RGB — later frame.
            t: temporal position (0=frame_a, 1=frame_b).

        Returns:
            (H,W,3) uint8 RGB interpolated frame.
        """
        if self.model is not None:
            kind, model = self.model
            if kind == "rife":
                return self._interpolate_rife(model, frame_a, frame_b, t)
            elif kind == "onnx":
                return self._interpolate_onnx(model, frame_a, frame_b, t)
        return self._interpolate_optflow(frame_a, frame_b, t)

    def interpolate_multi(
        self,
        frame_a: np.ndarray,
        frame_b: np.ndarray,
        n_frames: int = 3,
    ) -> list[np.ndarray]:
        """Generate *n_frames* evenly spaced intermediate frames."""
        results = []
        for i in range(1, n_frames + 1):
            t = i / (n_frames + 1)
            results.append(self.interpolate(frame_a, frame_b, t))
        return results

    def slow_motion(
        self,
        frames: list[np.ndarray],
        factor: int = 4,
    ) -> list[np.ndarray]:
        """
        Create slow-motion sequence by inserting (factor-1) frames
        between each consecutive pair.
        """
        if len(frames) < 2:
            return frames

        output = [frames[0]]
        for i in range(len(frames) - 1):
            interp = self.interpolate_multi(frames[i], frames[i + 1], factor - 1)
            output.extend(interp)
            output.append(frames[i + 1])
        return output

    @staticmethod
    def _interpolate_rife(model, frame_a, frame_b, t):
        result = model.inference(frame_a, frame_b, timestep=t)
        if isinstance(result, torch.Tensor):
            result = (result.squeeze().permute(1, 2, 0).cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
        return result

    @staticmethod
    def _interpolate_onnx(sess, frame_a, frame_b, t):
        h, w = frame_a.shape[:2]
        # Pad to multiple of 32
        ph = ((h - 1) // 32 + 1) * 32
        pw = ((w - 1) // 32 + 1) * 32

        def preprocess(img):
            padded = np.zeros((ph, pw, 3), dtype=np.float32)
            padded[:h, :w] = img.astype(np.float32) / 255.0
            return padded.transpose(2, 0, 1)[np.newaxis]

        a = preprocess(frame_a)
        b = preprocess(frame_b)
        t_arr = np.array([[t]], dtype=np.float32)

        inputs = sess.get_inputs()
        feed = {}
        if len(inputs) >= 3:
            feed[inputs[0].name] = a
            feed[inputs[1].name] = b
            feed[inputs[2].name] = t_arr
        else:
            combined = np.concatenate([a, b], axis=1)
            feed[inputs[0].name] = combined

        result = sess.run(None, feed)[0]
        result = result[0].transpose(1, 2, 0)[:h, :w]
        return (result * 255).clip(0, 255).astype(np.uint8)

    @staticmethod
    def _interpolate_optflow(frame_a, frame_b, t):
        """Optical flow warping + linear blend fallback."""
        try:
            import cv2

            gray_a = cv2.cvtColor(frame_a, cv2.COLOR_RGB2GRAY)
            gray_b = cv2.cvtColor(frame_b, cv2.COLOR_RGB2GRAY)
            flow = cv2.calcOpticalFlowFarneback(
                gray_a, gray_b, None, 0.5, 3, 15, 3, 5, 1.2, 0
            )

            h, w = frame_a.shape[:2]
            flow_map = np.column_stack(
                (np.repeat(np.arange(w)[np.newaxis, :], h, axis=0).flatten(),
                 np.repeat(np.arange(h)[:, np.newaxis], w, axis=1).flatten())
            ).reshape(h, w, 2).astype(np.float32)

            warped_a = cv2.remap(
                frame_a,
                (flow_map + flow * t)[:, :, 0],
                (flow_map + flow * t)[:, :, 1],
                cv2.INTER_LINEAR,
            )
            warped_b = cv2.remap(
                frame_b,
                (flow_map - flow * (1 - t))[:, :, 0],
                (flow_map - flow * (1 - t))[:, :, 1],
                cv2.INTER_LINEAR,
            )
            blended = (warped_a.astype(np.float32) * (1 - t) + warped_b.astype(np.float32) * t)
            return blended.clip(0, 255).astype(np.uint8)
        except Exception:
            # Simplest fallback: linear blend
            blend = frame_a.astype(np.float32) * (1 - t) + frame_b.astype(np.float32) * t
            return blend.clip(0, 255).astype(np.uint8)


def load_frame_interpolator(device: str = "cuda") -> FrameInterpolator:
    weights = model_path("rife")
    return FrameInterpolator(str(weights), device)
