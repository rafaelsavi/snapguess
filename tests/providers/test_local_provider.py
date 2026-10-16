"""Unit tests for the LocalFolderPhotoProvider implementation."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import ExifTags, Image

from src.providers.base import ProviderError
from src.providers.local import (
    LocalFolderPhotoProvider,
    _convert_dms_to_dd,
    _parse_exif_datetime,
)


def _create_sample_image(
    path: Path,
    *,
    width: int = 100,
    height: int = 100,
    date_str: str | None = None,
    lat_dms: tuple[tuple[float, float, float], str] | None = None,
    lon_dms: tuple[tuple[float, float, float], str] | None = None,
    color: tuple[int, int, int] = (100, 150, 200),
) -> None:
    """Create a test JPEG file with optional EXIF timestamps and GPS tags."""
    img = Image.new('RGB', (width, height), color=color)
    exif = img.getexif()

    if date_str:
        exif[ExifTags.Base.DateTimeOriginal] = date_str

    if lat_dms and lon_dms:
        gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
        gps_ifd[ExifTags.GPS.GPSLatitude] = lat_dms[0]
        gps_ifd[ExifTags.GPS.GPSLatitudeRef] = lat_dms[1]
        gps_ifd[ExifTags.GPS.GPSLongitude] = lon_dms[0]
        gps_ifd[ExifTags.GPS.GPSLongitudeRef] = lon_dms[1]

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format='JPEG', exif=exif)


def test_dms_to_dd_conversion() -> None:
    """Verify conversion from degrees/minutes/seconds to decimal degrees."""
    # Paris: 48° 51' 24" N, 2° 21' 7" E
    lat = _convert_dms_to_dd((48.0, 51.0, 24.0), 'N')
    assert lat is not None
    assert round(lat, 4) == 48.8567

    # South coordinates should be negative
    lat_s = _convert_dms_to_dd((23.0, 33.0, 1.0), 'S')
    assert lat_s is not None
    assert round(lat_s, 4) == -23.5503

    # West coordinates should be negative
    lon_w = _convert_dms_to_dd((46.0, 38.0, 2.0), 'W')
    assert lon_w is not None
    assert round(lon_w, 4) == -46.6339

    # Rational tuples (num, den) from raw EXIF
    lat_rational = _convert_dms_to_dd(((48, 1), (51, 1), (24, 1)), 'N')
    assert lat_rational is not None
    assert round(lat_rational, 4) == 48.8567

    # Bytes reference from camera EXIF (e.g. b'S', b'W')
    lat_bytes = _convert_dms_to_dd((23.0, 33.0, 1.0), b'S')
    assert lat_bytes is not None
    assert round(lat_bytes, 4) == -23.5503

    # Out of bounds coordinates (> 180 deg)
    assert _convert_dms_to_dd((250.0, 0.0, 0.0), 'N') is None

    # Edge cases
    assert _convert_dms_to_dd(None, 'N') is None
    assert _convert_dms_to_dd([], 'N') is None
    assert _convert_dms_to_dd(('bad', 'data', 'here'), 'N') is None


def test_parse_exif_datetime() -> None:
    """Verify parsing of EXIF datetime strings into ISO UTC format."""
    assert _parse_exif_datetime('2023:07:15 14:30:45') == '2023-07-15T14:30:45Z'
    assert _parse_exif_datetime('2024-01-01 00:00:00') == '2024-01-01T00:00:00Z'
    assert _parse_exif_datetime('2022:12:31T23:59:59') == '2022-12-31T23:59:59Z'
    assert _parse_exif_datetime(b'2023:07:15 14:30:45') == '2023-07-15T14:30:45Z'
    # Uninitialized or corrupted EXIF dates should be discarded
    assert _parse_exif_datetime('0000:00:00 00:00:00') is None
    assert _parse_exif_datetime('invalid-timestamp') is None
    assert _parse_exif_datetime(None) is None


def test_provider_initialization_and_listing(tmp_path: Path) -> None:
    """Verify library directory configuration and listing."""
    dir_a = tmp_path / 'photos_a'
    dir_b = tmp_path / 'photos_b'
    dir_a.mkdir()
    dir_b.mkdir()

    provider = LocalFolderPhotoProvider(
        {
            'Family': str(dir_a),
            'Travel': str(dir_b),
        }
    )

    assert provider.provider_id == 'local'
    assert provider.list_libraries() == ['Family', 'Travel']
    assert provider.get_library_path('Family') == dir_a.resolve()

    with pytest.raises(ProviderError, match='Unknown library: Unknown'):
        provider.get_library_path('Unknown')


async def test_provider_validate_access(tmp_path: Path) -> None:
    """Verify access validation for existent, missing, or non-directory paths."""
    dir_valid = tmp_path / 'valid'
    dir_valid.mkdir()
    file_path = tmp_path / 'some_file.txt'
    file_path.write_text('content')

    provider = LocalFolderPhotoProvider(
        {
            'valid': str(dir_valid),
            'missing': str(tmp_path / 'nonexistent'),
            'file': str(file_path),
        }
    )

    await provider.validate_access('valid')

    with pytest.raises(ProviderError, match='does not exist'):
        await provider.validate_access('missing')

    with pytest.raises(ProviderError, match='not a directory'):
        await provider.validate_access('file')

    with pytest.raises(ProviderError, match='Unknown library'):
        await provider.validate_access('unknown')


def test_resolve_asset_path_and_traversal_protection(tmp_path: Path) -> None:
    """Verify bidirectional asset ID resolution and path traversal rejection."""
    lib_dir = tmp_path / 'photos'
    sub_dir = lib_dir / '2023' / 'Summer'
    sub_dir.mkdir(parents=True)
    img_path = sub_dir / 'beach.jpg'
    img_path.write_bytes(b'fake-image')

    provider = LocalFolderPhotoProvider({'lib': str(lib_dir)})

    rel_posix = '2023/Summer/beach.jpg'
    asset_id = rel_posix.encode('utf-8').hex()

    resolved = provider.resolve_asset_path('lib', asset_id)
    assert resolved == img_path.resolve()

    # Invalid hex string
    with pytest.raises(ProviderError, match='Invalid asset ID format'):
        provider.resolve_asset_path('lib', 'not-valid-hex!@#')

    # Path traversal attempt with ../
    traversal_rel = '../../outside.jpg'
    traversal_id = traversal_rel.encode('utf-8').hex()
    with pytest.raises(ProviderError, match='Path traversal detected'):
        provider.resolve_asset_path('lib', traversal_id)

    # Path traversal attempt with absolute path /etc/passwd
    abs_traversal_id = b'/etc/passwd'.hex()
    with pytest.raises(ProviderError, match='Path traversal detected'):
        provider.resolve_asset_path('lib', abs_traversal_id)

    # Path traversal attempt with Windows backslashes ..\\secret
    win_traversal_id = b'..\\secret.jpg'.hex()
    with pytest.raises(ProviderError, match='Path traversal detected'):
        provider.resolve_asset_path('lib', win_traversal_id)

    # Path traversal attempt with Windows drive letter or colon
    drive_traversal_id = b'C:\\secret.jpg'.hex()
    with pytest.raises(ProviderError, match='Path traversal detected'):
        provider.resolve_asset_path('lib', drive_traversal_id)

    colon_traversal_id = b'folder:stream'.hex()
    with pytest.raises(ProviderError, match='Path traversal detected'):
        provider.resolve_asset_path('lib', colon_traversal_id)

    # Missing file
    missing_id = b'missing/file.jpg'.hex()
    with pytest.raises(ProviderError, match='Asset file not found on disk'):
        provider.resolve_asset_path('lib', missing_id)


def test_scan_library_files_missing_directory(tmp_path: Path) -> None:
    """Verify scan_library_files raises ProviderError when library path is missing."""
    provider = LocalFolderPhotoProvider({'missing': tmp_path / 'nonexistent'})
    with pytest.raises(ProviderError, match='does not exist'):
        provider.scan_library_files('missing', cached_mtimes={})


async def test_get_asset_bytes_anti_cheat_and_resizing(tmp_path: Path) -> None:
    """Verify thumbnail generation resizes images and strips 100% of EXIF/GPS tags."""
    lib_dir = tmp_path / 'photos'
    img_path = lib_dir / 'photo.jpg'

    # Create a large 2000x1500 image with GPS EXIF
    _create_sample_image(
        img_path,
        width=2000,
        height=1500,
        date_str='2023:08:14 12:00:00',
        lat_dms=((48.0, 51.0, 24.0), 'N'),
        lon_dms=((2.0, 21.0, 7.0), 'E'),
    )

    provider = LocalFolderPhotoProvider({'lib': str(lib_dir)})
    asset_id = b'photo.jpg'.hex()

    data, content_type = await provider.get_asset_bytes('lib', asset_id)
    assert content_type == 'image/jpeg'
    assert len(data) > 0

    # Inspect generated thumbnail
    thumb_img = Image.open(io.BytesIO(data))
    assert thumb_img.format == 'JPEG'
    # Thumbnail should be downscaled so max dimension is <= 1280
    assert max(thumb_img.size) <= 1280

    # Anti-cheat check: ensure generated JPEG has NO EXIF tags (empty or None)
    exif = thumb_img.getexif()
    assert len(exif) == 0, 'Generated thumbnail must have all EXIF metadata stripped for anti-cheat!'

    # Test transparent PNG image compositing on white
    png_path = lib_dir / 'transparent.png'
    rgba_img = Image.new('RGBA', (200, 200), color=(255, 0, 0, 128))
    rgba_img.save(png_path, format='PNG')
    png_id = b'transparent.png'.hex()
    png_data, png_type = await provider.get_asset_bytes('lib', png_id)
    assert png_type == 'image/jpeg'
    parsed_png = Image.open(io.BytesIO(png_data))
    assert parsed_png.mode == 'RGB'


def test_scan_library_files_and_reverse_geocoding(tmp_path: Path) -> None:
    """Verify recursive scanning, album mapping, delta caching, and offline reverse-geocoding."""
    lib_dir = tmp_path / 'library'
    root_photo = lib_dir / 'root.jpg'
    sub_photo = lib_dir / 'Vacations' / 'France' / 'paris.jpg'
    other_file = lib_dir / 'notes.txt'

    _create_sample_image(
        root_photo,
        date_str='2021:05:01 10:00:00',
    )
    _create_sample_image(
        sub_photo,
        date_str='2023:07:15 14:00:00',
        lat_dms=((48.0, 51.0, 24.0), 'N'),
        lon_dms=((2.0, 21.0, 7.0), 'E'),
    )
    other_file.parent.mkdir(parents=True, exist_ok=True)
    other_file.write_text('ignore me')

    # Hidden directory and AppleDouble files should be ignored
    hidden_dir = lib_dir / '.git' / 'nested'
    hidden_dir.mkdir(parents=True, exist_ok=True)
    (hidden_dir / 'should_ignore.jpg').write_bytes(b'fake')

    appledouble = lib_dir / 'Vacations' / 'France' / '._paris.jpg'
    appledouble.write_bytes(b'apple-double-metadata')

    provider = LocalFolderPhotoProvider({'vacation': str(lib_dir)})

    # 1. Full scan
    asset_dicts, albums_data, asset_albums, all_seen = provider.scan_library_files(
        'vacation',
        cached_mtimes={},
        is_delta=False,
    )

    assert len(all_seen) == 2
    assert len(asset_dicts) == 2

    # Check album mapping: subfolder mapped to "Vacations / France"
    album_names = {a['name'] for a in albums_data}
    assert 'Vacations / France' in album_names

    # Check asset albums: root photo has no album, sub_photo has album
    root_id = b'root.jpg'.hex()
    paris_id = b'Vacations/France/paris.jpg'.hex()

    asset_album_pairs = dict(asset_albums)
    assert root_id not in asset_album_pairs
    assert paris_id in asset_album_pairs

    # Check reverse geocoding on Paris coordinates
    paris_entry = next(a for a in asset_dicts if a['id'] == paris_id)
    assert paris_entry['latitude'] is not None
    assert paris_entry['longitude'] is not None
    assert paris_entry['country'] == 'France'
    assert paris_entry['immich_updated_at'].startswith('mtime:')

    # 2. Delta scan with cached mtimes
    cached = {
        paris_id: f'mtime:{sub_photo.stat().st_mtime_ns}',
    }
    # Notice root_id is not in cached so it will parse, while paris_id matches exactly and is skipped
    delta_assets, delta_albums, delta_asset_albums, delta_seen = provider.scan_library_files(
        'vacation',
        cached_mtimes=cached,
        is_delta=True,
    )

    assert delta_seen == {root_id, paris_id}
    # Only root_photo needed parsing because paris_id was unchanged in delta
    assert len(delta_assets) == 1
    assert delta_assets[0]['id'] == root_id
