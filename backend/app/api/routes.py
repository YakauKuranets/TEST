"""
Финальный роутер PLAYE Studio Pro.
Архитектура: Zero-Copy + Forensic Frame Server + SAM 2 + Temporal Upscale.
"""

from __future__ import annotations
import os
import cv2
import logging
import io
from typing import Any, Dict, List, Optional, Tuple
from fastapi import APIRouter, HTTPException, Request, BackgroundTasks, Depends
from pydantic import BaseModel
from fastapi.responses import StreamingResponse

try:
    from celery.result import AsyncResult
except Exception:  # pragma: no cover - celery is optional in desktop bundle
    class AsyncResult:  # type: ignore[override]
        def __init__(self, task_id: str):
            self.task_id = task_id
            self.state = "UNKNOWN"

from app.api.response import success_response
from app.core.video_engine import LocalVideoEngine
from app.models.forensic import ForensicHypothesisEngine

logger = logging.getLogger(__name__)
router = APIRouter()

# Инициализация синглтонов
video_engine = LocalVideoEngine()
forensic_engine = ForensicHypothesisEngine()

# --- МОДЕЛИ ДАННЫХ ---

class VideoJobRequest(BaseModel):
    file_path: str
    output_path: str
    operations: List[str]
    fps: Optional[float] = 30.0

class SamRequest(BaseModel):
    file_path: str
    points: List[List[float]]
    labels: List[int]
    frame_time: float

class TemporalRequest(BaseModel):
    file_path: str
    timestamp: float
    window_size: int = 5  # Количество кадров для анализа (рекомендуется 5-7)


class PropagateRequest(BaseModel):
    file_path: str
    start_frame_time: float


PRESET_DEFAULTS: Dict[str, Dict[str, Dict[str, Any]]] = {
    "forensic_safe": {
        "denoise": {"level": "light"},
        "upscale": {"factor": 2},
    },
    "presentation": {
        "denoise": {"level": "medium"},
        "upscale": {"factor": 8},
    },
}


def normalize_job_params(operation: str, params: Dict[str, Any]) -> Tuple[str, List[Any], Dict[str, Any]]:
    operation = str(operation or "").strip().lower()
    payload = dict(params or {})

    preset = payload.pop("preset", None)
    meta: Dict[str, Any] = {}
    if preset is not None:
        preset = str(preset).strip().lower()
        if preset not in PRESET_DEFAULTS:
            raise HTTPException(status_code=422, detail=f"preset must be one of {', '.join(sorted(PRESET_DEFAULTS))}")
        meta["preset"] = preset
        payload = {**PRESET_DEFAULTS[preset].get(operation, {}), **payload}

    if operation == "upscale":
        factor_raw = payload.get("factor", 2)
        try:
            factor = int(factor_raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="factor must be one of 2, 4, 8")
        if factor not in {2, 4, 8}:
            raise HTTPException(status_code=422, detail="factor must be one of 2, 4, 8")
        meta["factor"] = factor
        return operation, [factor], meta

    if operation == "denoise":
        level = str(payload.get("level", "medium")).strip().lower()
        if level not in {"light", "medium", "heavy"}:
            raise HTTPException(status_code=422, detail="level must be one of light, medium, heavy")
        meta["level"] = level
        return operation, [level], meta

    if operation == "detect_objects":
        args: List[Any] = [None, None]
        if "scene_threshold" in payload:
            try:
                scene_threshold = float(payload["scene_threshold"])
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="scene_threshold must be numeric")
            if not 0 <= scene_threshold <= 100:
                raise HTTPException(status_code=422, detail="scene_threshold must be between 0 and 100")
            meta["scene_threshold"] = scene_threshold
            args[0] = scene_threshold
        if "temporal_window" in payload:
            try:
                temporal_window = int(payload["temporal_window"])
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="temporal_window must be an integer")
            if not 1 <= temporal_window <= 12:
                raise HTTPException(status_code=422, detail="temporal_window must be between 1 and 12")
            meta["temporal_window"] = temporal_window
            args[1] = temporal_window
        return operation, args, meta

    raise HTTPException(status_code=422, detail=f"Unsupported operation: {operation}")


def _to_task_status(async_result: Any, task_id: str) -> Dict[str, Any]:
    state = str(getattr(async_result, "state", "UNKNOWN") or "UNKNOWN").upper()
    payload: Dict[str, Any] = {"task_id": task_id, "raw_state": state}
    state_map = {
        "PENDING": ("pending", 0, False, 700),
        "RECEIVED": ("queued", 0, False, 700),
        "STARTED": ("running", 1, False, 700),
        "PROGRESS": ("running", 0, False, 700),
        "SUCCESS": ("done", 100, True, 0),
        "FAILURE": ("failed", 100, True, 0),
        "REVOKED": ("canceled", 100, True, 0),
        "RETRY": ("retry", 0, False, 900),
    }
    status, default_progress, is_final, poll_after_ms = state_map.get(state, ("unknown", 0, False, 1000))
    payload.update({
        "status": status,
        "progress": default_progress,
        "is_final": is_final,
        "poll_after_ms": poll_after_ms,
    })

    if state == "PROGRESS":
        info = getattr(async_result, "info", {}) or {}
        payload["progress"] = int(info.get("progress", payload["progress"]))
        payload["meta"] = {k: v for k, v in info.items() if k != "progress"}
    elif state == "SUCCESS":
        payload["result"] = getattr(async_result, "result", None)
    elif state == "FAILURE":
        payload["error"] = str(getattr(async_result, "result", "Task failed"))

    return payload


def _log_enterprise_action(*_args: Any, **_kwargs: Any) -> None:
    """No-op placeholder used by enterprise middleware in API tests."""


@router.post("/jobs/{task_id}/cancel")
async def cancel_job(request: Request, task_id: str, auth: Any = Depends(lambda: None)):
    async_result = AsyncResult(task_id)
    if hasattr(async_result, "revoke"):
        async_result.revoke(terminate=False)
        _log_enterprise_action("job_cancel", task_id=task_id)
        status_payload = {
            "task_id": task_id,
            "status": "canceled",
            "is_final": True,
            "poll_after_ms": 0,
        }
        return success_response(request, status="done", result=status_payload)

    status_payload = {
        "task_id": task_id,
        "status": "cancel-unsupported",
        "is_final": False,
        "poll_after_ms": 1000,
    }
    return success_response(request, status="accepted", result=status_payload)

# --- ЭНДПОИНТЫ ВИДЕО И КАДРОВ ---

@router.post("/job/video/process")
async def process_video_local(req: VideoJobRequest, background_tasks: BackgroundTasks, request: Request):
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail="Файл не найден")
    background_tasks.add_task(video_engine.process_video, req.file_path, req.output_path, req.operations)
    return success_response(request, status="processing", result={"output": req.output_path})

@router.get("/video/frame")
async def get_exact_frame(path: str, timestamp: float):
    if not os.path.exists(path): raise HTTPException(404, "Файл не найден")
    try:
        import ffmpeg
        out, _ = (
            ffmpeg
            .input(path, ss=timestamp)
            .output('pipe:', vframes=1, format='image2', vcodec='png', quiet=True)
            .run(capture_stdout=True)
        )
        return StreamingResponse(io.BytesIO(out), media_type="image/png")
    except Exception as e:
        logger.error(f"FFmpeg Frame Error: {e}")
        raise HTTPException(500, "Ошибка Frame Server")

# --- AI: TEMPORAL ENHANCE (ПУНКТ 1) ---

@router.post("/ai/forensic/temporal-enhance")
async def api_temporal_enhance(req: TemporalRequest, request: Request):
    """
    Криминалистическое улучшение на основе накопления кадров.
    Собирает информацию из соседних кадров для восстановления деталей.
    """
    if not os.path.exists(req.file_path):
        raise HTTPException(404, "Файл не найден")

    # 1. Собираем пачку кадров (Batch) вокруг указанного времени
    frame_batch = []
    fps = 30.0  # В идеале вытянуть из video_engine.get_metadata(req.file_path)
    step = 1.0 / fps

    # Смещаемся назад на половину окна, чтобы текущий кадр был в центре
    start_t = max(0, req.timestamp - (req.window_size // 2) * step)

    for i in range(req.window_size):
        t = start_t + (i * step)
        # Используем наш быстрый метод получения RAW кадра
        img = video_engine.get_raw_frame(req.file_path, t)
        if img is not None:
            frame_batch.append(img)

    if len(frame_batch) < 3:
        raise HTTPException(400, "Недостаточно данных для временного анализа")

    # 2. Запускаем алгоритм объединения (Multi-frame Fusion)
    enhanced_np = forensic_engine.process_temporal_upscale(frame_batch)

    # 3. Сохраняем результат как "доказательство"
    base_dir = os.path.dirname(req.file_path)
    file_name = f"temporal_recon_{req.timestamp:.3f}.png"
    out_path = os.path.join(base_dir, file_name)

    # Сохраняем (переводя обратно в BGR для OpenCV)
    cv2.imwrite(out_path, cv2.cvtColor(enhanced_np, cv2.COLOR_RGB2BGR))

    return success_response(request, status="done", result={
        "enhanced_image_path": out_path,
        "frames_used": len(frame_batch)
    })

# --- AI: SAM 2 & HYPOTHESIS ---

@router.post("/ai/sam2/segment")
async def api_sam_segment(req: SamRequest, request: Request):
    img_np = video_engine.get_raw_frame(req.file_path, req.frame_time)
    if img_np is None: raise HTTPException(500, "Ошибка декодирования")

    result = forensic_engine.apply_smart_mask(img_np, req.points, req.labels)
    if result is None: return success_response(request, status="error", result="Model not loaded")
    return success_response(request, status="done", result=result)

@router.post("/ai/sam2/propagate")
async def api_sam_propagate(req: PropagateRequest, background_tasks: BackgroundTasks, request: Request):
    background_tasks.add_task(forensic_engine.track_object_in_video, req.file_path, req.start_frame_time)
    return success_response(request, status="processing", result="Tracking started")

@router.post("/ai/forensic-hypothesis")
async def api_generate_hypotheses(req: VideoJobRequest, request: Request):
    img = cv2.imread(req.file_path)
    if img is None: raise HTTPException(404)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    variants = forensic_engine.generate_variants(img, steps=4)
    output_paths = []
    base_dir = os.path.dirname(req.file_path)

    for i, var in enumerate(variants):
        p = os.path.join(base_dir, f"hypo_v{i}_{os.path.basename(req.file_path)}")
        cv2.imwrite(p, cv2.cvtColor(var, cv2.COLOR_RGB2BGR))
        output_paths.append(p)

    return success_response(request, status="done", result={"hypotheses": output_paths})

# --- СИСТЕМНЫЕ ---

@router.get("/system/models-status")
async def get_models_status(request: Request):
    registry = forensic_engine.model_registry
    status_map = {}
    for key, filename in registry.items():
        status_map[key] = {
            "exists": forensic_engine._is_model_ready(key),
            "is_loaded": key in forensic_engine.active_models,
            "filename": filename
        }
    return success_response(request, status="done", result=status_map)

@router.get("/jobs/{task_id}")
async def get_job_status(request: Request, task_id: str):
    return success_response(request, status="done", result={"is_final": True})


# ═══════════════════════════════════════════════════════════════
# KILLER FEATURES: Deblur, ELA, Auto-Analyze
# ═══════════════════════════════════════════════════════════════

from fastapi import File, UploadFile, Form
from PIL import Image
import numpy as np
import base64


def _read_upload_image(file_bytes: bytes) -> np.ndarray:
    """Read uploaded file bytes into BGR numpy array."""
    img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def _numpy_to_png_stream(img_np: np.ndarray) -> io.BytesIO:
    """Convert BGR numpy to PNG bytes stream."""
    rgb = cv2.cvtColor(img_np, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    buf.seek(0)
    return buf


@router.post("/ai/forensic/deblur")
async def forensic_deblur(
    request: Request,
    file: UploadFile = File(...),
    intensity: int = Form(default=50),
    angle: float = Form(default=0.0),
):
    """
    Killer Feature #1: Motion Blur Fixer.
    Wiener deconvolution to recover text/plates from motion-blurred frames.
    """
    from app.models.forensic import apply_blind_deconvolution

    try:
        raw = await file.read()
        img = _read_upload_image(raw)
        intensity = max(1, min(100, intensity))
        angle = float(max(-180.0, min(180.0, angle)))
        result = apply_blind_deconvolution(img, intensity=intensity, angle=angle)
        buf = _numpy_to_png_stream(result)
        image_base64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return success_response(request, status="done", result={
            "image_base64": image_base64,
            "intensity": intensity,
            "angle": angle,
        })
    except Exception as e:
        logger.error("Deblur error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/forensic/ela")
async def forensic_ela(
    file: UploadFile = File(...),
    quality: int = Form(default=95),
    scale: int = Form(default=15)
):
    """
    Killer Feature #2: Error Level Analysis.
    Detects manipulated/inserted regions via JPEG recompression artifacts.
    Bright areas in heatmap = possible tampering.
    """
    from app.models.forensic import generate_ela_map

    try:
        raw = await file.read()
        img = _read_upload_image(raw)
        heatmap = generate_ela_map(img, quality=quality, scale=scale)
        buf = _numpy_to_png_stream(heatmap)
        return StreamingResponse(buf, media_type="image/png")
    except Exception as e:
        logger.error("ELA error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/forensic/auto-analyze")
async def forensic_auto_analyze(
    request: Request,
    file: UploadFile = File(...)
):
    """
    Killer Feature #3: Auto-Analysis AI Agent.
    Measures noise, blur, brightness and suggests optimal pipeline.
    """
    from app.models.forensic import analyze_image_metrics

    try:
        raw = await file.read()
        img = _read_upload_image(raw)
        metrics = analyze_image_metrics(img)
        return success_response(request, status="done", result=metrics)
    except Exception as e:
        logger.error("Auto-analyze error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
