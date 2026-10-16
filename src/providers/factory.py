"""Provider factory for instantiating the configured photo backend."""

from __future__ import annotations

from src.config import AppSettings
from src.providers.base import BasePhotoProvider, ProviderError
from src.providers.immich import ImmichPhotoProvider


def create_photo_provider(settings: AppSettings) -> BasePhotoProvider:
    """Instantiate and return the configured photo provider based on application settings."""
    provider_type = settings.photo_provider.lower().strip()

    if provider_type == 'immich':
        return ImmichPhotoProvider(
            server_url=settings.immich_server_url,
            library_keys=settings.immich_libraries,
        )

    raise ProviderError(f"Unsupported PHOTO_PROVIDER: '{settings.photo_provider}'")
