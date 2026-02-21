"""System Routes: hardware SSE + model manifest/status + model manager operations."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.core.model_manager import get_model_manager, HardwareMonitor
from app.core.models_config import MODELS_MANIFEST, iter_models

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/system", tags=["system"])


@router.get("/hardware-stream")
async def hardware_sse(request: Request):
    hw = HardwareMonitor()

    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            metrics = hw.get_metrics()
            mgr = get_model_manager()
            metrics["models"] = {mid: mgr.model_states.get(mid, "not_installed") for mid in mgr.manifest}
            metrics["download_progress"] = dict(mgr.download_progress)
            yield f"data: {json.dumps(metrics)}\n\n"
            await asyncio.sleep(2)

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no",
    })


@router.get("/models-config")
async def models_config():
    return MODELS_MANIFEST


@router.get("/models-status")
async def models_status():
    models_root = Path(os.getenv("PLAYE_MODELS_DIR", r"D:\PLAYE\models"))
    status_map: dict[str, bool] = {}
    for _category, model in iter_models():
        status_map[model["id"]] = os.path.exists(models_root / model["file"])
    return status_map


@router.get("/models")
async def list_models():
    mgr = get_model_manager()
    models = mgr.get_all_status()
    hw = HardwareMonitor()
    return {"models": models, "hardware": hw.get_metrics()}


@router.post("/models/{model_id}/download")
async def download_model(model_id: str, background_tasks: BackgroundTasks):
    mgr = get_model_manager()
    if model_id not in mgr.manifest:
        return {"status": "queued_external", "model_id": model_id}

    state = mgr.model_states.get(model_id)
    if state in {"on_disk", "in_vram"}:
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
    mgr = get_model_manager()
    if model_id not in mgr.manifest:
        raise HTTPException(404, f"Unknown model: {model_id}")
    success = await mgr.load_to_vram(model_id)
    if success:
        return {"status": "loaded", "model_id": model_id}
    state = mgr.model_states.get(model_id, "not_installed")
    raise HTTPException(400, f"Cannot load {model_id} (state: {state})")


@router.post("/models/{model_id}/unload")
async def unload_model(model_id: str):
    mgr = get_model_manager()
    if mgr.unload_from_vram(model_id):
        return {"status": "unloaded", "model_id": model_id}
    raise HTTPException(400, f"{model_id} is not loaded")


@router.delete("/models/{model_id}")
async def delete_model(model_id: str):
    models_root = Path(os.getenv("PLAYE_MODELS_DIR", r"D:\PLAYE\models"))
    for _category, model in iter_models():
        if model["id"] == model_id:
            file_path = models_root / model["file"]
            if file_path.exists():
                file_path.unlink()
            return {"status": "deleted", "model_id": model_id}
    mgr = get_model_manager()
    if model_id in mgr.manifest:
        mgr.delete_model(model_id)
        return {"status": "deleted", "model_id": model_id}
    raise HTTPException(404, f"Unknown model: {model_id}")
