"""Authentication API endpoint returning the current user's role and identity."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request

from src.auth.models import AuthContext
from src.auth.service import get_current_auth

auth_router = APIRouter(prefix='/api/auth', tags=['auth'])


@auth_router.get('/me')
async def get_current_user(
    request: Request,
    auth: AuthContext = Depends(get_current_auth),
) -> dict[str, Any]:
    """Return the resolved role, email, and authentication status for the current request."""
    settings = getattr(request.app.state, 'settings', None)
    lock = bool(settings and getattr(settings, 'cf_lock_player_name', False) and auth.authenticated and auth.name)
    return {
        'role': auth.role_label,
        'email': auth.email,
        'name': auth.name,
        'authenticated': auth.authenticated,
        'lock_player_name': lock,
    }
