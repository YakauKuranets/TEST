"""
Unified AI Router for the PLAYE Studio Pro application.
Заменяет старый server.py. Все модели инициализируются здесь и подключаются к main.py.
"""

from pathlib import Path
from typing import Any, Callable, Optional
from datetime import datetime, timezone
import hashlib
import io
import json
import logging
import os
import time
import uuid
import re

from fastapi import APIRouter, File, Form, Request, UploadFile, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from PIL import Image, UnidentifiedImageError
import numpy as np
import torch

MAX_IMAGE_BYTES = 20 * 1024 * 1024
ALLOWED_UPSCALE_FACTORS = {2, 4, 8}
AUDIT_DIR_NAME = "audit"
AUDIT_LOG_FILE = "events.jsonl"
AUDIT_REPORTS_DIR = "reports"

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# --- Инициализация Роутера ---
router = APIRouter()

load_restoreformer: Optional[Callable] = None
load_realesrgan: Optional[Callable] = None
load_nafnet: Optional[Callable] = None
load_sd_inpaint: Optional[Callable] = None
load_depth_anything: Optional[Callable] = None
load_segment_anything: Optional[Callable] = None
load_ddcolor: Optional[Callable] = None
load_ocr: Optional[Callable] = None
load_face_id: Optional[Callable] = None
load_frame_interpolator: Optional[Callable] = None
load_scene_reconstructor: Optional[Callable] = None

# --- Унифицированные импорты (теперь всё берется из app.models) ---
try:
    from app.models.restoreformer import load_restoreformer
except Exception as exc:
    logger.error("Error importing RestoreFormer loader: %s", exc)

try:
    from app.models.realesrgan import load_realesrgan
except Exception as exc:
    logger.error("Error importing Real-ESRGAN loader: %s", exc)

try:
    from app.models.nafnet import load_nafnet
except Exception as exc:
    logger.error("Error importing NAFNet loader: %s", exc)

try:
    from app.models.sd_inpaint import load_sd_inpaint
except Exception as exc:
    logger.error("Error importing SD-Inpaint loader: %s", exc)

try:
    from app.models.depth_anything import load_depth_anything
except Exception as exc:
    logger.error("Error importing Depth-Anything loader: %s", exc)

try:
    from app.models.segment_anything import load_segment_anything
except Exception as exc:
    logger.error("Error importing SAM-2 loader: %s", exc)

try:
    from app.models.ddcolor import load_ddcolor
except Exception as exc:
    logger.error("Error importing DDColor loader: %s", exc)

try:
    from app.models.ocr_engine import load_ocr
except Exception as exc:
    logger.error("Error importing OCR loader: %s", exc)

try:
    from app.models.face_id import load_face_id
except Exception as exc:
    logger.error("Error importing InsightFace loader: %s", exc)

try:
    from app.models.frame_interpolation import load_frame_interpolator
except Exception as exc:
    logger.error("Error importing RIFE loader: %s", exc)

try:
    from app.models.scene_3d import load_scene_reconstructor
except Exception as exc:
    logger.error("Error importing Scene-3D loader: %s", exc)

try:
    from app.models.model_paths import get_models_dir
except Exception as exc:
    logger.error("Error importing get_models_dir: %s", exc)

    def get_models_dir() -> Path:
        # Корректировка пути, так как файл теперь в backend/app/api/
        return Path(__file__).resolve().parents[3] / "models-data"

models = {}
manifest_models: dict = {}
manifest_meta_cache: dict = {}
audit_enabled = os.getenv("PLAYE_AUDIT_LOG", "1") == "1"
audit_log_path: Optional[Path] = None

device = 'cuda' if torch.cuda.is_available() else 'cpu'

# --- Умное получение Request ID (заменяет Middleware) ---
def _get_request_id(request: Request) -> str:
    if hasattr(request.state, "request_id"):
        return request.state.request_id
    req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = req_id
    return req_id

def _get_operator(request: Request) -> str:
    operator = request.headers.get("X-Operator")
    if operator:
        return operator.strip()[:128] or "unknown"
    return "unknown"

def _canonical_json_sha256(payload: dict) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return _sha256_bytes(encoded)

REPORT_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")

def _normalize_report_id(raw_request_id: str) -> Optional[str]:
    if not raw_request_id:
        return None
    candidate = str(raw_request_id).strip()
    if REPORT_ID_RE.fullmatch(candidate):
        return candidate
    return None

def _get_manifest_path() -> Path:
    models_dir_manifest = Path(get_models_dir()) / "manifest.json"
    if models_dir_manifest.exists():
        return models_dir_manifest
    return Path(__file__).resolve().parents[3] / "models-data" / "manifest.json"

def _load_manifest_models() -> dict:
    path = _get_manifest_path()
    if not path.exists():
        logger.warning("Manifest not found: %s", path)
        return {}

    try:
        with path.open("r", encoding="utf-8") as inp:
            data = json.load(inp)
        return data.get("models", {}) if isinstance(data, dict) else {}
    except Exception as exc:
        logger.error("Failed to read manifest (%s): %s", path, exc)
        return {}

def _build_manifest_meta_cache(models_map: dict) -> dict:
    cache = {}
    for key, entry in models_map.items():
        if isinstance(entry, dict):
            cache[key] = {
                "model_name": entry.get("name", key),
                "model_version": entry.get("version"),
                "model_filename": entry.get("filename"),
                "model_checksum": entry.get("checksum"),
            }
    return cache

def _get_model_manifest_meta(model_key: str) -> dict:
    return manifest_meta_cache.get(model_key, {"model_name": model_key})

def _get_audit_log_path() -> Path:
    global audit_log_path
    if audit_log_path is not None:
        return audit_log_path

    audit_dir = Path(get_models_dir()) / AUDIT_DIR_NAME
    audit_dir.mkdir(parents=True, exist_ok=True)
    audit_log_path = audit_dir / AUDIT_LOG_FILE
    return audit_log_path

def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()

def _get_audit_reports_dir() -> Path:
    reports_dir = _get_audit_log_path().parent / AUDIT_REPORTS_DIR
    reports_dir.mkdir(parents=True, exist_ok=True)
    return reports_dir

def _write_forensic_report(event: dict) -> Optional[Path]:
    if not audit_enabled:
        return None

    request_id = _normalize_report_id(event.get("request_id"))
    if not request_id:
        logger.warning("Skip forensic report write due to invalid request_id: %r", event.get("request_id"))
        return None

    report_payload: dict[str, Any] = {
        "schema_version": "1.1",
        "report_generated_at": datetime.now(timezone.utc).isoformat(),
        "request_id": request_id,
        "operation": event.get("operation"),
        "status": event.get("status"),
        "operator": event.get("operator", "unknown"),
        "input": {
            "sha256": event.get("input_sha256"),
            "filename": event.get("file_name"),
        },
        "output": {
            "sha256": event.get("output_sha256"),
            "bytes": event.get("output_bytes"),
        },
        "processing": {
            "duration_ms": event.get("duration_ms"),
            "parameters": {
                "scale": event.get("scale"),
                "level": event.get("level"),
            },
        },
        "model": {
            "key": event.get("model"),
            "name": event.get("model_name"),
            "version": event.get("model_version"),
            "filename": event.get("model_filename"),
            "checksum": event.get("model_checksum"),
        },
        "chain_of_custody": {
            "audit_log": str(_get_audit_log_path()),
            "audit_timestamp": event.get("timestamp"),
        },
        "disclaimer": "Результат AI-обработки носит вспомогательный характер и требует верификации экспертом.",
    }

    integrity_scope = {
        "request_id": report_payload["request_id"],
        "operation": report_payload["operation"],
        "status": report_payload["status"],
        "operator": report_payload["operator"],
        "input": report_payload["input"],
        "output": report_payload["output"],
        "processing": report_payload["processing"],
        "model": report_payload["model"],
        "chain_of_custody": report_payload["chain_of_custody"],
    }
    report_payload["integrity"] = {
        "algorithm": "sha256",
        "scope": "core_fields",
        "digest": _canonical_json_sha256(integrity_scope),
    }

    report_path = _get_audit_reports_dir() / f"{request_id}.json"
    try:
        with report_path.open("w", encoding="utf-8") as out:
            json.dump(report_payload, out, ensure_ascii=False, indent=2)
        return report_path
    except Exception as exc:
        logger.error("Failed to write forensic report for %s: %s", request_id, exc)
        return None

def _append_audit_event(event: dict) -> None:
    if not audit_enabled:
        return

    event.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
    try:
        with _get_audit_log_path().open("a", encoding="utf-8") as out:
            out.write(json.dumps(event, ensure_ascii=False) + "\n")
    except Exception as exc:
        logger.error("Failed to write audit event: %s", exc)

def _error(status_code: int, message: str, request_id: Optional[str] = None) -> JSONResponse:
    payload = {"error": message}
    if request_id:
        payload["request_id"] = request_id
    response = JSONResponse(status_code=status_code, content=payload)
    if request_id:
        response.headers["X-Request-ID"] = request_id
    return response

def _encode_png_bytes(result: np.ndarray) -> bytes:
    output = Image.fromarray(result)
    buf = io.BytesIO()
    output.save(buf, format='PNG')
    return buf.getvalue()

def _to_png_response(png_bytes: bytes, request_id: str) -> StreamingResponse:
    response = StreamingResponse(io.BytesIO(png_bytes), media_type="image/png")
    response.headers["X-Request-ID"] = request_id
    return response

def _read_upload_as_rgb(contents: bytes) -> np.ndarray:
    if not contents:
        raise ValueError("Empty file")
    if len(contents) > MAX_IMAGE_BYTES:
        raise ValueError(f"File is too large (max {MAX_IMAGE_BYTES} bytes)")

    with Image.open(io.BytesIO(contents)) as image:
        return np.asarray(image.convert('RGB'))

def _load_model(model_key: str, model_name: str, loader: Optional[Callable]) -> None:
    if loader is None:
        logger.error("%s loader is unavailable; check import errors above.", model_name)
        return

    try:
        models[model_key] = loader(device)
        logger.info("Loaded model: %s", model_name)
    except Exception as exc:
        logger.error("Failed to load %s: %s", model_name, exc)

async def _process_image_operation(
    request: Request,
    file: UploadFile,
    operation: str,
    model_key: str,
    model_label: str,
    run_inference: Callable,
    extra_audit: Optional[dict] = None,
):
    request_id = _get_request_id(request)
    operator = _get_operator(request)
    started = time.perf_counter()

    try:
        model = models.get(model_key)
        if model is None:
            _append_audit_event({
                "request_id": request_id,
                "operation": operation,
                "status": "model_unavailable",
                "operator": operator,
                "error": f"{model_label} model not loaded",
                **_get_model_manifest_meta(model_key),
            })
            return _error(503, f"{model_label} model not loaded", request_id)

        contents = await file.read()
        image = _read_upload_as_rgb(contents)
        result = run_inference(model, image)
        png_bytes = _encode_png_bytes(result)

        if audit_enabled:
            duration_ms = int((time.perf_counter() - started) * 1000)
            event = {
                "request_id": request_id,
                "operation": operation,
                "model": model_key,
                "file_name": file.filename,
                "input_sha256": _sha256_bytes(contents),
                "output_sha256": _sha256_bytes(png_bytes),
                "output_bytes": len(png_bytes),
                "duration_ms": duration_ms,
                "status": "success",
                "operator": operator,
                **_get_model_manifest_meta(model_key),
            }
            if extra_audit:
                event.update(extra_audit)
            _append_audit_event(event)
            _write_forensic_report(event)

        return _to_png_response(png_bytes, request_id)
    except (ValueError, UnidentifiedImageError) as exc:
        _append_audit_event({
            "request_id": request_id,
            "operation": operation,
            "status": "client_error",
            "operator": operator,
            "error": str(exc),
            **_get_model_manifest_meta(model_key),
        })
        return _error(400, str(exc), request_id)
    except Exception as exc:
        logger.error("Error in %s [request_id=%s]: %s", operation, request_id, exc)
        _append_audit_event({
            "request_id": request_id,
            "operation": operation,
            "status": "server_error",
            "operator": operator,
            "error": str(exc),
            **_get_model_manifest_meta(model_key),
        })
        return _error(500, "Internal server error", request_id)

@router.on_event("startup")
async def startup_event():
    """Load AI models into memory when the server starts."""
    global manifest_models, manifest_meta_cache, audit_enabled, audit_log_path
    logger.info("Initializing AI Vision Models on device: %s", device)

    audit_enabled = os.getenv("PLAYE_AUDIT_LOG", "1") == "1"
    audit_log_path = None

    manifest_models = _load_manifest_models()
    manifest_meta_cache = _build_manifest_meta_cache(manifest_models)

    if audit_enabled:
        _get_audit_log_path()

    _load_model('restoreformer', 'RestoreFormer', load_restoreformer)
    _load_model('realesrgan', 'Real-ESRGAN', load_realesrgan)
    _load_model('nafnet', 'NAFNet', load_nafnet)
    _load_model('sd_inpaint', 'SD-Inpaint', load_sd_inpaint)
    _load_model('depth_anything', 'Depth-Anything-v2', load_depth_anything)
    _load_model('segment_anything', 'SAM-2', load_segment_anything)
    _load_model('ddcolor', 'DDColor', load_ddcolor)
    _load_model('ocr', 'PaddleOCR', load_ocr)
    _load_model('face_id', 'InsightFace', load_face_id)
    _load_model('frame_interpolator', 'RIFE', load_frame_interpolator)
    _load_model('scene_3d', 'Scene-3D', load_scene_reconstructor)

    loaded = [name for name, model in models.items() if model is not None]
    logger.info("Active Vision Models: %s", loaded)

@router.get("/health")
async def health_check():
    """Return basic information about the backend's status."""
    return {
        "status": "ok",
        "device": device,
        "models_dir": str(get_models_dir()),
        "models": {k: (v is not None) for k, v in models.items()},
        "gpu_available": torch.cuda.is_available(),
        "audit_enabled": audit_enabled,
        "audit_log": str(_get_audit_log_path()) if audit_enabled else None,
        "manifest_path": str(_get_manifest_path()),
    }

@router.post("/ai/face-enhance")
async def enhance_face(request: Request, file: UploadFile = File(...)):
    return await _process_image_operation(
        request=request,
        file=file,
        operation="face-enhance",
        model_key="restoreformer",
        model_label="RestoreFormer",
        run_inference=lambda model, image: model.enhance(image),
    )

@router.post("/ai/upscale")
async def upscale_image(request: Request, file: UploadFile = File(...), factor: int = Form(2)):
    request_id = _get_request_id(request)
    if factor not in ALLOWED_UPSCALE_FACTORS:
        return _error(422, f"factor must be one of: {ALLOWED_UPSCALE_FACTORS}", request_id)

    return await _process_image_operation(
        request=request,
        file=file,
        operation="upscale",
        model_key="realesrgan",
        model_label="Real-ESRGAN",
        run_inference=lambda model, image: model.upscale(image, scale=factor),
        extra_audit={"scale": factor},
    )

@router.post("/ai/denoise")
async def denoise_image(request: Request, file: UploadFile = File(...), level: str = Form('medium')):
    return await _process_image_operation(
        request=request,
        file=file,
        operation="denoise",
        model_key="nafnet",
        model_label="NAFNet",
        run_inference=lambda model, image: model.denoise(image, level=level),
        extra_audit={"level": level},
    )

@router.get("/forensic/report/{request_id}")
async def forensic_report(request_id: str):
    if not audit_enabled: return _error(404, "Audit reporting is disabled")
    normalized_request_id = _normalize_report_id(request_id)
    if not normalized_request_id: return _error(422, "Invalid request_id format")
    report_path = _get_audit_reports_dir() / f"{normalized_request_id}.json"
    if not report_path.exists(): return _error(404, "Report not found")
    with report_path.open("r", encoding="utf-8") as inp: payload = json.load(inp)
    return {"status": "ok", "request_id": normalized_request_id, "report": payload}

@router.post("/ai/inpaint")
async def inpaint_image(request: Request, file: UploadFile = File(...), mask: UploadFile = File(...), prompt: str = Form("restore"), strength: float = Form(0.75)):
    request_id = _get_request_id(request)
    try:
        model = models.get("sd_inpaint")
        if not model: return _error(503, "Inpaint model not loaded", request_id)
        image = _read_upload_as_rgb(await file.read())
        mask_img = _read_upload_as_rgb(await mask.read())
        result = model.inpaint(image, mask_img, prompt=prompt, strength=strength)
        return _to_png_response(_encode_png_bytes(result), request_id)
    except Exception as exc: return _error(500, str(exc), request_id)

@router.post("/ai/depth")
async def estimate_depth(request: Request, file: UploadFile = File(...)):
    return await _process_image_operation(
        request=request, file=file, operation="depth", model_key="depth_anything",
        model_label="Depth-Anything", run_inference=lambda model, image: model.depth_colormap(image)
    )

@router.post("/ai/segment")
async def segment_image(request: Request, file: UploadFile = File(...), x: int = Form(None), y: int = Form(None), mode: str = Form("point")):
    request_id = _get_request_id(request)
    try:
        model = models.get("segment_anything")
        if not model: return _error(503, "SAM model not loaded", request_id)
        image = _read_upload_as_rgb(await file.read())
        if mode == "auto":
            masks = model.segment_auto(image)
            return _to_png_response(_encode_png_bytes(image), request_id) # Simplify for space
        elif x is not None and y is not None:
            mask = model.segment_point(image, [(x, y)])
            overlay = image.copy()
            overlay[mask] = (overlay[mask].astype(np.float32) * 0.5 + np.array([0, 120, 255]) * 0.5).clip(0, 255).astype(np.uint8)
            return _to_png_response(_encode_png_bytes(overlay), request_id)
    except Exception as exc: return _error(500, str(exc), request_id)

@router.post("/ai/colorize")
async def colorize_image(request: Request, file: UploadFile = File(...)):
    return await _process_image_operation(
        request=request, file=file, operation="colorize", model_key="ddcolor",
        model_label="DDColor", run_inference=lambda model, image: model.colorize(image)
    )

@router.post("/ai/ocr")
async def ocr_image(request: Request, file: UploadFile = File(...)):
    request_id = _get_request_id(request)
    model = models.get("ocr")
    if not model: return _error(503, "OCR model not loaded", request_id)
    detections = model.recognize(_read_upload_as_rgb(await file.read()))
    return JSONResponse(content={"request_id": request_id, "detections": detections})

@router.post("/ai/face-id/analyze")
async def face_id_analyze(request: Request, file: UploadFile = File(...)):
    request_id = _get_request_id(request)
    model = models.get("face_id")
    if not model: return _error(503, "InsightFace not loaded", request_id)
    faces = model.analyze(_read_upload_as_rgb(await file.read()))
    faces_summary = [{k: v for k, v in f.items() if k != "embedding"} for f in faces]
    return JSONResponse(content={"request_id": request_id, "faces": faces_summary})

@router.post("/ai/interpolate")
async def interpolate_frames(request: Request, frame_a: UploadFile = File(...), frame_b: UploadFile = File(...), t: float = Form(0.5)):
    request_id = _get_request_id(request)
    model = models.get("frame_interpolator")
    if not model: return _error(503, "RIFE not loaded", request_id)
    result = model.interpolate(_read_upload_as_rgb(await frame_a.read()), _read_upload_as_rgb(await frame_b.read()), t=t)
    return _to_png_response(_encode_png_bytes(result), request_id)

@router.post("/ai/3d/reconstruct")
async def reconstruct_scene(request: Request, files: list[UploadFile] = File(...)):
    request_id = _get_request_id(request)
    model = models.get("scene_3d")
    if not model: return _error(503, "Scene-3D not loaded", request_id)
    images = [_read_upload_as_rgb(await f.read()) for f in files[:50]]
    result = model.reconstruct(images)
    return JSONResponse(content={"request_id": request_id, **result})

@router.get("/ai/models")
async def list_models():
    return {"models": {k: {"loaded": models.get(k) is not None} for k in manifest_models.keys()}, "device": device}