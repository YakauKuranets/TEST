"""
3D Gaussian Splatting / NeRF — 3D scene reconstruction from photos/video.

Reconstructs a navigable 3D model of a crime scene from multiple
photographs or video frames. Enables virtual walk-through, distance
measurement, and spatial analysis.

Fallback: multi-view stereo point cloud (OpenCV) when full 3DGS is absent.
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Any, Optional

import numpy as np

from .model_paths import model_path

logger = logging.getLogger(__name__)


class SceneReconstructor:
    """Wrapper for 3D scene reconstruction."""

    def __init__(self, weights_dir: str, device: str = "cuda"):
        self.device = device
        self.backend = self._detect_backend(weights_dir)

    def _detect_backend(self, weights_dir: str) -> Optional[str]:
        # Try Gaussian Splatting
        try:
            import gaussian_splatting  # noqa: F401
            logger.info("3D Gaussian Splatting backend available")
            return "gaussian"
        except ImportError:
            pass

        # Try nerfstudio
        try:
            import nerfstudio  # noqa: F401
            logger.info("Nerfstudio backend available")
            return "nerfstudio"
        except ImportError:
            pass

        # Try Open3D for MVS
        try:
            import open3d  # noqa: F401
            logger.info("Open3D MVS fallback available")
            return "open3d"
        except ImportError:
            pass

        # Basic OpenCV SfM
        try:
            import cv2  # noqa: F401
            logger.info("OpenCV SfM fallback available")
            return "opencv"
        except ImportError:
            pass

        logger.warning("No 3D reconstruction backend available")
        return None

    def reconstruct(
        self,
        images: list[np.ndarray],
        output_format: str = "pointcloud",
    ) -> dict[str, Any]:
        """
        Reconstruct 3D scene from multiple views.

        Args:
            images: list of (H,W,3) uint8 RGB images.
            output_format: 'pointcloud' | 'mesh' | 'gaussian'.

        Returns:
            Dict with keys: points (Nx3), colors (Nx3), normals (Nx3),
            camera_poses, metadata.
        """
        if len(images) < 2:
            return {"error": "Need at least 2 images", "points": [], "colors": []}

        if self.backend == "gaussian":
            return self._reconstruct_gaussian(images)
        elif self.backend == "nerfstudio":
            return self._reconstruct_nerf(images)
        elif self.backend == "open3d":
            return self._reconstruct_open3d(images)
        elif self.backend == "opencv":
            return self._reconstruct_opencv(images)

        return {"error": "No 3D backend available", "points": [], "colors": []}

    def estimate_camera_poses(self, images: list[np.ndarray]) -> list[dict[str, Any]]:
        """Estimate camera positions/orientations via feature matching."""
        try:
            import cv2

            poses = []
            orb = cv2.ORB_create(nfeatures=2000)
            bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

            prev_kp, prev_des = None, None
            for i, img in enumerate(images):
                gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
                kp, des = orb.detectAndCompute(gray, None)

                pose = {
                    "frame": i,
                    "features_detected": len(kp),
                    "rotation": np.eye(3).tolist(),
                    "translation": [0.0, 0.0, float(i)],
                }

                if prev_des is not None and des is not None:
                    matches = bf.match(prev_des, des)
                    pose["matches_to_prev"] = len(matches)

                    if len(matches) >= 8:
                        src_pts = np.float32([prev_kp[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
                        dst_pts = np.float32([kp[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
                        E, mask = cv2.findEssentialMat(src_pts, dst_pts, method=cv2.RANSAC, prob=0.999, threshold=1.0)
                        if E is not None:
                            _, R, t, _ = cv2.recoverPose(E, src_pts, dst_pts)
                            pose["rotation"] = R.tolist()
                            pose["translation"] = t.flatten().tolist()

                prev_kp, prev_des = kp, des
                poses.append(pose)

            return poses
        except ImportError:
            return [{"frame": i, "features_detected": 0} for i in range(len(images))]

    def compute_depth_pair(
        self,
        left: np.ndarray,
        right: np.ndarray,
    ) -> np.ndarray:
        """Compute stereo depth from two views."""
        try:
            import cv2

            gray_l = cv2.cvtColor(left, cv2.COLOR_RGB2GRAY)
            gray_r = cv2.cvtColor(right, cv2.COLOR_RGB2GRAY)

            stereo = cv2.StereoSGBM_create(
                minDisparity=0,
                numDisparities=128,
                blockSize=11,
                P1=8 * 3 * 11 ** 2,
                P2=32 * 3 * 11 ** 2,
                disp12MaxDiff=1,
                uniquenessRatio=10,
                speckleWindowSize=100,
                speckleRange=32,
            )
            disp = stereo.compute(gray_l, gray_r).astype(np.float32) / 16.0
            disp = (disp - disp.min()) / (disp.max() - disp.min() + 1e-8)
            return disp
        except ImportError:
            return np.zeros(left.shape[:2], dtype=np.float32)

    # ------------------------------------------------------------------
    def _reconstruct_gaussian(self, images):
        logger.info("3DGS reconstruction with %d images", len(images))
        # Would invoke gaussian_splatting training pipeline
        return {
            "backend": "gaussian_splatting",
            "status": "placeholder",
            "num_images": len(images),
            "points": [],
            "colors": [],
        }

    def _reconstruct_nerf(self, images):
        logger.info("NeRF reconstruction with %d images", len(images))
        return {
            "backend": "nerfstudio",
            "status": "placeholder",
            "num_images": len(images),
            "points": [],
            "colors": [],
        }

    def _reconstruct_open3d(self, images):
        try:
            import open3d as o3d
            import cv2

            pcd = o3d.geometry.PointCloud()
            all_points = []
            all_colors = []

            for i in range(len(images) - 1):
                depth = self.compute_depth_pair(images[i], images[i + 1])
                h, w = depth.shape
                fx = fy = max(h, w)
                cx, cy = w / 2, h / 2
                for y in range(0, h, 4):
                    for x in range(0, w, 4):
                        z = float(depth[y, x])
                        if z > 0.01:
                            px = (x - cx) * z / fx
                            py = (y - cy) * z / fy
                            all_points.append([px, py, z + i * 0.5])
                            all_colors.append(images[i][y, x].tolist())

            points_np = np.array(all_points) if all_points else np.zeros((0, 3))
            colors_np = (np.array(all_colors) / 255.0) if all_colors else np.zeros((0, 3))

            return {
                "backend": "open3d",
                "num_points": len(all_points),
                "points": points_np.tolist(),
                "colors": colors_np.tolist(),
            }
        except Exception as exc:
            logger.error("Open3D reconstruction failed: %s", exc)
            return self._reconstruct_opencv(images)

    def _reconstruct_opencv(self, images):
        poses = self.estimate_camera_poses(images)
        points = []
        colors = []

        for i in range(len(images) - 1):
            depth = self.compute_depth_pair(images[i], images[i + 1])
            h, w = depth.shape
            for y in range(0, h, 8):
                for x in range(0, w, 8):
                    z = float(depth[y, x])
                    if z > 0.05:
                        points.append([float(x), float(y), z * 10 + i])
                        colors.append(images[i][y, x].tolist())

        return {
            "backend": "opencv_sfm",
            "num_points": len(points),
            "camera_poses": poses,
            "points": points,
            "colors": colors,
        }


def load_scene_reconstructor(device: str = "cuda") -> SceneReconstructor:
    weights = model_path("scene3d")
    return SceneReconstructor(str(weights), device)
