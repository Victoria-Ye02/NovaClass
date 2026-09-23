"""SQLite/SQLAlchemy models for user history and progress tracking."""

from __future__ import annotations

import enum
from datetime import datetime
from pathlib import Path

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DATABASE_URL = f"sqlite:///{DATA_DIR / 'topik_ai.db'}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class SkillArea(str, enum.Enum):
    READING = "reading"
    LISTENING = "listening"
    WRITING = "writing"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(100))
    target_level: Mapped[int] = mapped_column(Integer, default=3)  # TOPIK level 1-6
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    exam_sessions: Mapped[list["ExamSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    weakness_profiles: Mapped[list["WeaknessProfile"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    exam_paper_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    skill_area: Mapped[SkillArea] = mapped_column(Enum(SkillArea))
    total_questions: Mapped[int] = mapped_column(Integer, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    total_score: Mapped[float] = mapped_column(Float, default=0.0)
    max_score: Mapped[float] = mapped_column(Float, default=0.0)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="exam_sessions")
    question_logs: Mapped[list["QuestionLog"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class QuestionLog(Base):
    __tablename__ = "question_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("exam_sessions.id"), index=True)
    question_id: Mapped[str] = mapped_column(String(64), index=True)  # ChromaDB document id
    question_type: Mapped[str] = mapped_column(String(50))  # e.g. "grammar", "main_idea"
    difficulty: Mapped[str] = mapped_column(String(20))
    user_answer: Mapped[str | None] = mapped_column(Text, nullable=True)  # null => left unanswered
    correct_answer: Mapped[str] = mapped_column(Text)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    points_earned: Mapped[float] = mapped_column(Float, default=0.0)
    points_possible: Mapped[float] = mapped_column(Float, default=0.0)
    ai_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)  # Myanmar-language feedback (Writing)
    # Myanmar-language MC-question explanation (Reading/Listening), populated only for
    # wrong/unanswered questions -- see app/prompts/mc_explanation.py.
    explanation_correct: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation_wrong: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation_grammar: Mapped[str | None] = mapped_column(Text, nullable=True)
    answered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["ExamSession"] = relationship(back_populates="question_logs")


class WeaknessProfile(Base):
    __tablename__ = "weakness_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    skill_area: Mapped[SkillArea] = mapped_column(Enum(SkillArea))
    question_type: Mapped[str] = mapped_column(String(50))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    accuracy: Mapped[float] = mapped_column(Float, default=0.0)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="weakness_profiles")


def init_db() -> None:
    """Create the SQLite data directory and all tables. Call once on app startup."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)


def get_db() -> Session:
    """FastAPI dependency that yields a scoped SQLAlchemy session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
