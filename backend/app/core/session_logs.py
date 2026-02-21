"""Session log persistence for downstream AI analysis."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SESSION_LOG_FILE = "session_logs.json"


def get_reports_root() -> Path:
    return Path(os.getenv("PLAYE_REPORTS_DIR", r"D:\PLAYE\reports"))


def ensure_reports_dir() -> Path:
    reports_root = get_reports_root()
    reports_root.mkdir(parents=True, exist_ok=True)
    return reports_root


def get_session_logs_path() -> Path:
    return ensure_reports_dir() / SESSION_LOG_FILE


def _normalize_logs(logs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for entry in logs:
        if not isinstance(entry, dict):
            continue
        normalized.append(
            {
                "timestamp": entry.get("timestamp") or datetime.now(timezone.utc).isoformat(),
                "source": str(entry.get("source", "system")),
                "message": str(entry.get("message", "")),
                "meta": entry.get("meta", {}),
            }
        )
    return normalized


def read_session_logs() -> list[dict[str, Any]]:
    path = get_session_logs_path()
    if not path.exists():
        return []

    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (json.JSONDecodeError, OSError):
        return []

    return payload if isinstance(payload, list) else []


def persist_session_logs(logs: list[dict[str, Any]], append: bool = True) -> dict[str, Any]:
    normalized = _normalize_logs(logs)
    existing = read_session_logs() if append else []
    combined = [*existing, *normalized]

    path = get_session_logs_path()
    with path.open("w", encoding="utf-8") as handle:
        json.dump(combined, handle, ensure_ascii=False, indent=2)

    return {
        "status": "ok",
        "saved": len(normalized),
        "total": len(combined),
        "path": str(path),
    }
