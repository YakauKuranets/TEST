"""SQLAlchemy models for local PLAYE PhotoLab."""

from __future__ import annotations
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    jobs = relationship("AIJob", back_populates="case", cascade="all, delete-orphan")


class AIJob(Base):
    __tablename__ = "ai_jobs"

    id = Column(Integer, primary_key=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True)
    task = Column(String, nullable=False)
    status = Column(String, default="pending")
    input_path = Column(String, nullable=True)
    output_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("Case", back_populates="jobs")