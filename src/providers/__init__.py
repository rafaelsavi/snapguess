"""Swappable photo providers subsystem for SnapGuess."""

from __future__ import annotations

from src.providers.base import BasePhotoProvider, ProviderError
from src.providers.factory import create_photo_provider
from src.providers.immich import ImmichClientError, ImmichPhotoProvider
from src.providers.local import LocalFolderPhotoProvider

__all__ = [
    'BasePhotoProvider',
    'ImmichClientError',
    'ImmichPhotoProvider',
    'LocalFolderPhotoProvider',
    'ProviderError',
    'create_photo_provider',
]
