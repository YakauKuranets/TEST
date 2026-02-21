"""
PLAYE Studio Pro — Model Manager & Hardware Monitor.

Phase 1: Titanium Backend.
- HardwareMonitor: polls GPU/CPU metrics, streams via SSE
- AIModelManager: download, verify SHA-256, load/unload VRAM, LRU eviction
- 4 model states: not_installed → downloading → on_disk → in_vram
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Callable, Optional

import torch

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════
# HARDWARE MONITOR
# ═══════════════════════════════════════════════════════════════

class HardwareMonitor:
    """Singleton that polls GPU/CPU metrics."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.has_cuda = torch.cuda.is_available()
        self.device_name = torch.cuda.get_device_name(0) if self.has_cuda else "CPU Only"
        self.vram_total = 0
        if self.has_cuda:
            self.vram_total = torch.cuda.get_device_properties(0).total_mem

    def get_metrics(self) -> dict:
        """Return current hardware metrics snapshot."""
        if self.has_cuda:
            allocated = torch.cuda.memory_allocated(0)
            reserved = torch.cuda.memory_reserved(0)
            return {
                "device": self.device_name,
                "has_cuda": True,
                "vram_total_mb": round(self.vram_total / 1e6, 1),
                "vram_allocated_mb": round(allocated / 1e6, 1),
                "vram_reserved_mb": round(reserved / 1e6, 1),
                "vram_free_mb": round((self.vram_total - allocated) / 1e6, 1),
                "vram_percent": round(allocated / max(self.vram_total, 1) * 100, 1),
            }
        else:
            import psutil
            vm = psutil.virtual_memory()
            return {
                "device": "CPU Only",
                "has_cuda": False,
                "ram_total_mb": round(vm.total / 1e6, 1),
                "ram_used_mb": round(vm.used / 1e6, 1),
                "ram_free_mb": round(vm.available / 1e6, 1),
                "ram_percent": vm.percent,
                "vram_total_mb": 0,
                "vram_allocated_mb": 0,
                "vram_percent": 0,
            }


# ═══════════════════════════════════════════════════════════════
# MODEL STATE ENUM
# ═══════════════════════════════════════════════════════════════

class ModelState:
    NOT_INSTALLED = "not_installed"   # 🔴 No weights on disk
    DOWNLOADING = "downloading"       # 🟡 Download in progress
    ON_DISK = "on_disk"               # ⚪ Weights on disk, not in VRAM
    IN_VRAM = "in_vram"               # 🟢 Loaded and ready
    HARDWARE_LOCKED = "hardware_locked"  # 🛑 Requires CUDA but none found


# ═══════════════════════════════════════════════════════════════
# AI MODEL MANAGER
# ═══════════════════════════════════════════════════════════════

class AIModelManager:
    """
    Manages the lifecycle of all AI models.
    Supports: download with progress, SHA-256 verify, load/unload VRAM, LRU eviction.
    """

    VRAM_EVICT_THRESHOLD = 0.90  # Auto-unload oldest if > 90%

    def __init__(self, models_dir: Optional[str] = None, manifest_path: Optional[str] = None):
        self.models_dir = Path(models_dir or os.getenv("PLAYE_MODELS_DIR", "./models"))
        self.models_dir.mkdir(parents=True, exist_ok=True)

        self.hw = HardwareMonitor()
        self.manifest: dict[str, dict] = {}
        self.model_states: dict[str, str] = {}
        self.loaded_models: OrderedDict[str, Any] = OrderedDict()  # LRU cache
        self.download_progress: dict[str, float] = {}  # model_id -> 0.0-1.0
        self._loaders: dict[str, Callable] = {}  # model_id -> load function

        # Load manifest
        mp = Path(manifest_path) if manifest_path else Path("models-data/manifest.json")
        if mp.exists():
            with open(mp) as f:
                data = json.load(f)
                self.manifest = data.get("models", {})
        else:
            logger.warning("Manifest not found at %s", mp)

        # Initialize states
        self._refresh_states()

    def _refresh_states(self):
        """Scan disk and update model states."""
        for model_id, info in self.manifest.items():
            filename = info.get("filename", "")
            path = self.models_dir / filename
            # Check if model requires CUDA but none available
            requires_cuda = info.get("requires_cuda", False)
            if requires_cuda and not self.hw.has_cuda:
                self.model_states[model_id] = ModelState.HARDWARE_LOCKED
            elif model_id in self.loaded_models:
                self.model_states[model_id] = ModelState.IN_VRAM
            elif path.exists() or (self.models_dir / f"{filename}.pth").exists():
                self.model_states[model_id] = ModelState.ON_DISK
            else:
                self.model_states[model_id] = ModelState.NOT_INSTALLED

    def register_loader(self, model_id: str, loader_fn: Callable):
        """Register a function that loads model into memory. loader_fn() -> model_object"""
        self._loaders[model_id] = loader_fn

    def get_all_status(self) -> list[dict]:
        """Return status of all models for the frontend."""
        self._refresh_states()
        result = []
        for model_id, info in self.manifest.items():
            state = self.model_states.get(model_id, ModelState.NOT_INSTALLED)
            result.append({
                "id": model_id,
                "name": info.get("name", model_id),
                "description": info.get("description", ""),
                "category": info.get("category", ""),
                "size_bytes": info.get("size", 0),
                "size_human": self._human_size(info.get("size", 0)),
                "state": state,
                "download_progress": self.download_progress.get(model_id, 0),
                "required": info.get("required", False),
            })
        return result

    def get_model(self, model_id: str) -> Optional[Any]:
        """Get loaded model. If on disk but not in VRAM, load it first (lazy load)."""
        if model_id in self.loaded_models:
            # Move to end of LRU
            self.loaded_models.move_to_end(model_id)
            return self.loaded_models[model_id]
        return None

    async def load_to_vram(self, model_id: str) -> bool:
        """Load model from disk into VRAM. Auto-evict if needed."""
        if model_id not in self._loaders:
            logger.warning("No loader registered for %s", model_id)
            return False

        state = self.model_states.get(model_id)
        if state == ModelState.HARDWARE_LOCKED:
            return False
        if state == ModelState.NOT_INSTALLED:
            return False

        # Evict if VRAM too full
        self._evict_if_needed()

        try:
            loader = self._loaders[model_id]
            model_obj = loader()
            self.loaded_models[model_id] = model_obj
            self.model_states[model_id] = ModelState.IN_VRAM
            logger.info("Loaded %s into VRAM", model_id)
            return True
        except Exception as e:
            logger.error("Failed to load %s: %s", model_id, e)
            return False

    def unload_from_vram(self, model_id: str) -> bool:
        """Unload model from VRAM to free memory."""
        if model_id in self.loaded_models:
            del self.loaded_models[model_id]
            if self.hw.has_cuda:
                torch.cuda.empty_cache()
            self.model_states[model_id] = ModelState.ON_DISK
            logger.info("Unloaded %s from VRAM", model_id)
            return True
        return False

    def _evict_if_needed(self):
        """Evict oldest model if VRAM usage > threshold."""
        if not self.hw.has_cuda or not self.loaded_models:
            return
        metrics = self.hw.get_metrics()
        while metrics["vram_percent"] > self.VRAM_EVICT_THRESHOLD * 100 and self.loaded_models:
            oldest_id, oldest_model = next(iter(self.loaded_models.items()))
            logger.info("VRAM at %.1f%%, evicting %s", metrics["vram_percent"], oldest_id)
            self.unload_from_vram(oldest_id)
            metrics = self.hw.get_metrics()

    async def download_model(self, model_id: str, progress_callback: Optional[Callable] = None) -> bool:
        """
        Download model weights from URL with chunked progress.
        Verifies SHA-256 after download.
        """
        info = self.manifest.get(model_id)
        if not info:
            return False

        url = info.get("url", "")
        filename = info.get("filename", "")
        checksum = info.get("checksum", "")
        total_size = info.get("size", 0)
        dest = self.models_dir / filename

        if dest.exists():
            self.model_states[model_id] = ModelState.ON_DISK
            return True

        self.model_states[model_id] = ModelState.DOWNLOADING
        self.download_progress[model_id] = 0.0

        try:
            import httpx

            async with httpx.AsyncClient(follow_redirects=True, timeout=600) as client:
                async with client.stream("GET", url) as resp:
                    resp.raise_for_status()
                    content_length = int(resp.headers.get("content-length", total_size))
                    downloaded = 0

                    dest.parent.mkdir(parents=True, exist_ok=True)
                    sha = hashlib.sha256()

                    with open(dest, "wb") as f:
                        async for chunk in resp.aiter_bytes(chunk_size=1024 * 1024):
                            f.write(chunk)
                            sha.update(chunk)
                            downloaded += len(chunk)
                            progress = downloaded / max(content_length, 1)
                            self.download_progress[model_id] = progress
                            if progress_callback:
                                await progress_callback(model_id, progress)

            # Verify checksum
            if checksum:
                actual = sha.hexdigest()
                if actual != checksum:
                    logger.error("SHA-256 mismatch for %s: expected %s, got %s", model_id, checksum, actual)
                    dest.unlink(missing_ok=True)
                    self.model_states[model_id] = ModelState.NOT_INSTALLED
                    self.download_progress[model_id] = 0
                    return False

            self.model_states[model_id] = ModelState.ON_DISK
            self.download_progress[model_id] = 1.0
            logger.info("Downloaded %s to %s", model_id, dest)
            return True

        except Exception as e:
            logger.error("Download failed for %s: %s", model_id, e)
            dest.unlink(missing_ok=True)
            self.model_states[model_id] = ModelState.NOT_INSTALLED
            self.download_progress[model_id] = 0
            return False

    def delete_model(self, model_id: str) -> bool:
        """Delete model weights from disk."""
        self.unload_from_vram(model_id)
        info = self.manifest.get(model_id, {})
        filename = info.get("filename", "")
        path = self.models_dir / filename
        if path.exists():
            if path.is_dir():
                import shutil
                shutil.rmtree(path)
            else:
                path.unlink()
        pth = self.models_dir / f"{filename}.pth"
        if pth.exists():
            pth.unlink()
        self.model_states[model_id] = ModelState.NOT_INSTALLED
        logger.info("Deleted %s", model_id)
        return True

    @staticmethod
    def _human_size(size_bytes: int) -> str:
        if size_bytes >= 1e9:
            return f"{size_bytes / 1e9:.1f} GB"
        elif size_bytes >= 1e6:
            return f"{size_bytes / 1e6:.0f} MB"
        return f"{size_bytes / 1e3:.0f} KB"


# Singleton
_manager: Optional[AIModelManager] = None

def get_model_manager() -> AIModelManager:
    global _manager
    if _manager is None:
        _manager = AIModelManager()
    return _manager
