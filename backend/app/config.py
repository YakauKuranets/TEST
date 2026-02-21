"""Configuration for local backend."""

from __future__ import annotations
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    MODELS_DIR: str = "/models"
    CUDA_VISIBLE_DEVICES: Optional[str] = "0"
    MAX_IMAGE_SIZE: int = 4096
    BATCH_SIZE: int = 4

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()