"""PLAYE Studio Pro v3.0 — Unified Forensic AI Backend."""

from __future__ import annotations
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as core_router
from app.api.ai_routes import router as ai_router

try:
    from app.api.auth_routes import router as auth_router
except ImportError:
    auth_router = None

try:
    from app.api.enterprise_routes import router as enterprise_router
except ImportError:
    enterprise_router = None

try:
    from app.api.enterprise_reports import router as reports_router
except ImportError:
    reports_router = None

try:
    from app.api.system_routes import router as system_router
except ImportError:
    system_router = None

from app.db.database import create_tables
from app.core.models_config import ensure_models_manifest_synced

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="PLAYE Studio Pro", version="3.0.0", description="Unified Forensic AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core: video pipeline, SAM2, forensic-hypothesis, models-status
app.include_router(core_router, prefix="/api")
# AI vision: face-enhance, upscale, denoise, inpaint, depth, segment, colorize, ocr, face-id, interpolate, 3d
app.include_router(ai_router)

if auth_router:
    app.include_router(auth_router, prefix="/api/auth")
if enterprise_router:
    app.include_router(enterprise_router, prefix="/api/enterprise")
if reports_router:
    app.include_router(reports_router, prefix="/api/reports")
if system_router:
    app.include_router(system_router, prefix="/api")


@app.on_event("startup")
async def startup_event():
    create_tables()
    manifest_path = ensure_models_manifest_synced()
    logger.info("PLAYE Studio Pro: Unified Backend started")
    logger.info("Models manifest synced: %s", manifest_path)


@app.get("/")
async def root():
    return {"service": "PLAYE Studio Pro", "version": "3.0.0", "status": "ready"}
