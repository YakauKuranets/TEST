"""
Финальный роутер PLAYE Studio Pro.
Архитектура: Zero-Copy + Forensic Frame Server + SAM 2 + Temporal Upscale.
"""

from __future__ import annotations
import os
import cv2
import logging
import io
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel
from fastapi.responses import StreamingResponse

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
    file: UploadFile = File(...),
    intensity: int = Form(default=50)
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
        result = apply_blind_deconvolution(img, intensity=intensity)
        buf = _numpy_to_png_stream(result)
        return StreamingResponse(buf, media_type="image/png")
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