"""
PLAYE Studio Pro — System Routes.

Phase 1: SSE hardware metrics stream + model management endpoints.
- GET  /system/hardware-stream  — SSE: real-time VRAM/CPU metrics
- GET  /system/models           — All models with states
- POST /system/models/{id}/download — Start downloading model
- POST /system/models/{id}/load     — Load into VRAM
- POST /system/models/{id}/unload   — Unload from VRAM
- DELETE /system/models/{id}        — Delete from disk
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.core.model_manager import get_model_manager, HardwareMonitor

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/system", tags=["system"])


# ═══ SSE: Hardware Metrics Stream ═══

@router.get("/hardware-stream")
async def hardware_sse(request: Request):
    """
    Server-Sent Events stream of GPU/CPU metrics.
    Frontend connects once and receives updates every 2 seconds.
    """
    hw = HardwareMonitor()

    async def event_generator():
        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break
            metrics = hw.get_metrics()
            # Include model states
            mgr = get_model_manager()
            metrics["models"] = {
                mid: mgr.model_states.get(mid, "not_installed")
                for mid in mgr.manifest
            }
            metrics["download_progress"] = dict(mgr.download_progress)
            data = json.dumps(metrics)
            yield f"data: {data}\n\n"
            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ═══ Model Management ═══

@router.get("/models")
async def list_models():
    """Return all models with their current states."""
    mgr = get_model_manager()
    models = mgr.get_all_status()
    hw = HardwareMonitor()
    return {
        "models": models,
        "hardware": hw.get_metrics(),
    }


@router.post("/models/{model_id}/download")
async def download_model(model_id: str, background_tasks: BackgroundTasks):
    """Start downloading a model in the background."""
    mgr = get_model_manager()
    if model_id not in mgr.manifest:
        raise HTTPException(404, f"Unknown model: {model_id}")

    state = mgr.model_states.get(model_id)
    if state == "on_disk" or state == "in_vram":
        return {"status": "already_installed", "model_id": model_id}
    if state == "downloading":
        return {"status": "already_downloading", "model_id": model_id}

    async def _do_download():
        await mgr.download_model(model_id)

    background_tasks.add_task(asyncio.ensure_future, _do_download())
    mgr.model_states[model_id] = "downloading"
    return {"status": "download_started", "model_id": model_id}


@router.post("/models/{model_id}/load")
async def load_model(model_id: str):
    """Load model from disk into VRAM."""
    mgr = get_model_manager()
    if model_id not in mgr.manifest:
        raise HTTPException(404, f"Unknown model: {model_id}")

    success = await mgr.load_to_vram(model_id)
    if success:
        return {"status": "loaded", "model_id": model_id}
    else:
        state = mgr.model_states.get(model_id, "not_installed")
        raise HTTPException(400, f"Cannot load {model_id} (state: {state})")


@router.post("/models/{model_id}/unload")
async def unload_model(model_id: str):
    """Unload model from VRAM."""
    mgr = get_model_manager()
    if mgr.unload_from_vram(model_id):
        return {"status": "unloaded", "model_id": model_id}
    raise HTTPException(400, f"{model_id} is not loaded")


@router.delete("/models/{model_id}")
async def delete_model(model_id: str):
    """Delete model weights from disk."""
    mgr = get_model_manager()
    if model_id not in mgr.manifest:
        raise HTTPException(404, f"Unknown model: {model_id}")
    mgr.delete_model(model_id)
    return {"status": "deleted", "model_id": model_id}
