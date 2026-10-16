"""Unit tests for the BasePhotoProvider interface, ImmichPhotoProvider, and factory."""

from __future__ import annotations

import pytest

from src.config import AppSettings, ConfigError, load_settings
from src.providers import (
    BasePhotoProvider,
    ImmichClientError,
    ImmichPhotoProvider,
    ProviderError,
    create_photo_provider,
)


class DummyProvider(BasePhotoProvider):
    """Concrete provider stub for testing base interface contracts."""

    def __init__(self) -> None:
        self.closed = False

    @property
    def provider_id(self) -> str:
        return 'dummy'

    def list_libraries(self) -> list[str]:
        return ['vacation', 'family']

    async def validate_access(self, library_name: str) -> None:
        if library_name not in self.list_libraries():
            raise ProviderError(f'Unknown library: {library_name}')

    async def get_asset_bytes(self, library_name: str, asset_id: str) -> tuple[bytes, str]:
        return b'test-bytes', 'image/jpeg'

    async def aclose(self) -> None:
        self.closed = True


def test_base_provider_cannot_be_instantiated_directly() -> None:
    """Ensure BasePhotoProvider enforces abstract class instantiation rules."""
    with pytest.raises(TypeError, match="Can't instantiate abstract class BasePhotoProvider"):
        BasePhotoProvider()  # type: ignore[abstract]


async def test_base_provider_context_manager() -> None:
    """Verify asynchronous context manager enters cleanly and closes provider on exit."""
    provider = DummyProvider()
    assert not provider.closed
    async with provider as p:
        assert p.provider_id == 'dummy'
        assert p.list_libraries() == ['vacation', 'family']
        bytes_data, content_type = await p.get_asset_bytes('family', 'asset-1')
        assert bytes_data == b'test-bytes'
        assert content_type == 'image/jpeg'
    assert provider.closed


def test_provider_error_hierarchy() -> None:
    """Ensure ProviderError is a RuntimeError and ImmichClientError is a subclass."""
    assert issubclass(ProviderError, RuntimeError)
    assert issubclass(ImmichClientError, ProviderError)
    err = ImmichClientError('Connection timed out')
    assert isinstance(err, ProviderError)
    assert isinstance(err, RuntimeError)


def test_create_photo_provider_immich() -> None:
    """Verify factory returns ImmichPhotoProvider when photo_provider is 'immich'."""
    settings = AppSettings(
        immich_server_url='https://immich.test/api',
        immich_libraries={'default': 'secret-token'},
        photo_provider='immich',
    )
    provider = create_photo_provider(settings)
    assert isinstance(provider, ImmichPhotoProvider)
    assert provider.provider_id == 'immich'
    assert provider.list_libraries() == ['default']


def test_create_photo_provider_unsupported(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify factory raises ProviderError if an unknown provider name reaches it."""
    settings = AppSettings(
        immich_server_url='https://immich.test/api',
        immich_libraries={'default': 'secret-token'},
    )
    object.__setattr__(settings, 'photo_provider', 'unsupported_cloud')
    with pytest.raises(ProviderError, match="Unsupported PHOTO_PROVIDER: 'unsupported_cloud'"):
        create_photo_provider(settings)


def test_config_photo_provider_validation() -> None:
    """Verify AppSettings validates PHOTO_PROVIDER against permitted set."""
    # Valid
    s = AppSettings(
        immich_server_url='https://immich.test/api',
        immich_libraries={'default': 'token'},
        photo_provider='IMMICH',
    )
    assert s.photo_provider == 'immich'

    # Invalid
    with pytest.raises(ConfigError, match='PHOTO_PROVIDER must be one of'):
        AppSettings(
            immich_server_url='https://immich.test/api',
            immich_libraries={'default': 'token'},
            photo_provider='invalid_provider',
        )


def test_config_photo_provider_env_loading(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify load_settings reads PHOTO_PROVIDER from environment."""
    monkeypatch.setenv('IMMICH_SERVER_URL', 'https://immich.test/api')
    monkeypatch.setenv('IMMICH_LIBRARIES', '{"fam": "tok"}')
    monkeypatch.setenv('PHOTO_PROVIDER', 'immich')
    settings = load_settings()
    assert settings.photo_provider == 'immich'
