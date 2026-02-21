"""Database configuration (SQLite for Local Desktop)."""

import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.models import Base

# База данных будет лежать в папке пользователя ОС
db_dir = Path.home() / ".playelab"
db_dir.mkdir(parents=True, exist_ok=True)
db_path = db_dir / "local_data.db"

engine = create_engine(
    f"sqlite:///{db_path}",
    connect_args={"check_same_thread": False},
    echo=False
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def create_tables() -> None:
    Base.metadata.create_all(bind=engine)