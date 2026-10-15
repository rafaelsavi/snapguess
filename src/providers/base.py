"""Base interfaces and abstract class definitions for SnapGuess photo providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from types import TracebackType
from typing import Self


class ProviderError(RuntimeError):
    """Base exception for all photo provider errors."""

    pass


class BasePhotoProvider(ABC):
    """Abstract base class for photo providers (Immich, local folder, Nextcloud, etc.)."""

    @property
    @abstractmethod
    def provider_id(self) -> str:
        """Unique identifier for this provider (e.g. 'immich', 'local_folder')."""
        ...

    @abstractmethod
    def list_libraries(self) -> list[str]:
        """Return list of configured library/collection names."""
        ...

    @abstractmethod
    async def validate_access(self, library_name: str) -> None:
        """Validate connectivity and authentication for the library or raise ProviderError."""
        ...

    @abstractmethod
    async def get_asset_bytes(self, library_name: str, asset_id: str) -> tuple[bytes, str]:
        """Return raw thumbnail preview bytes and MIME content-type for an asset with EXIF stripped."""
        ...

    @abstractmethod
    async def aclose(self) -> None:
        """Close client connections and release underlying network/filesystem resources."""
        ...

    async def __aenter__(self: Self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        await self.aclose()
