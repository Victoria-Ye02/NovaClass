"""Shared FastAPI dependencies for routers."""

from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.models import User, get_db


def get_user_or_404(user_id: int, db: Session = Depends(get_db)) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found.")
    return user
