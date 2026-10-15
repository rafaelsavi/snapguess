"""Backward-compatible proxy module for Immich client, now located in src.providers.immich."""

from __future__ import annotations

from src.providers.immich import (
    ImmichClient,
    ImmichClientError,
    ImmichPhotoProvider,
)

__all__ = [
    'ImmichClient',
    'ImmichClientError',
    'ImmichPhotoProvider',
]
