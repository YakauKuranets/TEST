"""Case management persistence using .playe JSON files."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.session_logs import ensure_reports_dir

CASE_DIR_NAME = "cases"


def _cases_dir() -> Path:
    path = ensure_reports_dir() / CASE_DIR_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_case_id(case_id: str) -> str:
    cleaned = re.sub(r"[^\w\-.]+", "_", case_id.strip(), flags=re.UNICODE)
    return cleaned or f"case_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"


def _case_path(case_id: str) -> Path:
    return _cases_dir() / f"{_safe_case_id(case_id)}.playe"


def save_case(payload: dict[str, Any]) -> dict[str, Any]:
    case_id = str(payload.get("case_id") or "").strip()
    if not case_id:
        raise ValueError("case_id is required")

    normalized = {
        "case_id": case_id,
        "date": payload.get("date") or datetime.now(timezone.utc).date().isoformat(),
        "officer": str(payload.get("officer") or ""),
        "evidence": payload.get("evidence") if isinstance(payload.get("evidence"), list) else [],
        "metadata": payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {},
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    path = _case_path(case_id)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(normalized, handle, ensure_ascii=False, indent=2)

    return {"status": "ok", "case": normalized, "path": str(path)}


def load_case(case_id: str) -> dict[str, Any]:
    path = _case_path(case_id)
    if not path.exists():
        raise FileNotFoundError(case_id)

    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return {"status": "ok", "case": payload, "path": str(path)}
