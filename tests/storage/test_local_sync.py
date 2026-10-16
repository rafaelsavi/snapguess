"""Integration and regression tests for SyncEngine synchronization with LocalFolderPhotoProvider."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from PIL import ExifTags, Image

from src.models import BaseGameConfig, SyncMode, SyncStatus
from src.providers.local import LocalFolderPhotoProvider
from src.storage.db import DatabaseManager
from src.storage.metadata import AssetFilterCriteria, MetadataStore
from src.storage.sync import SyncEngine


def _create_test_image(
    path: Path,
    *,
    date_str: str | None = '2023:07:15 14:00:00',
    lat_dms: tuple[tuple[float, float, float], str] | None = ((48.0, 51.0, 24.0), 'N'),
    lon_dms: tuple[tuple[float, float, float], str] | None = ((2.0, 21.0, 7.0), 'E'),
) -> None:
    """Create a sample JPEG image with valid EXIF date and GPS tags."""
    img = Image.new('RGB', (100, 100), color=(120, 160, 200))
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


@pytest.fixture
def db_mgr(tmp_path: Path) -> DatabaseManager:
    return DatabaseManager(tmp_path / 'test_local_sync.db')


@pytest.fixture
def meta_store(db_mgr: DatabaseManager) -> MetadataStore:
    return MetadataStore(db_mgr)


async def test_local_sync_lifecycle_full_delta_and_pruning(
    tmp_path: Path,
    meta_store: MetadataStore,
) -> None:
    """Test full sync, incremental delta sync, and full-sync pruning against local directory."""
    photos_dir = tmp_path / 'local_photos'
    p1 = photos_dir / '2023' / 'beach.jpg'
    _create_test_image(p1, date_str='2023:06:10 12:00:00')

    provider = LocalFolderPhotoProvider({'vacations': photos_dir})
    callback = MagicMock()
    sync_engine = SyncEngine(provider, meta_store, on_sync_complete=callback)

    # 1. Initial Full Sync
    await sync_engine.sync_library('vacations', force_full=True)

    state = meta_store.get_sync_state('vacations')
    assert state['sync_status'] == SyncStatus.idle.value
    assert state['sync_mode'] == SyncMode.full.value
    assert state['total_assets'] == 1
    assert state['synced_assets'] == 1
    assert callback.call_count == 1
    assert callback.call_args[0][0] == 'vacations'

    # Check database records
    assert meta_store.count_library_assets('vacations') == 1
    albums = meta_store.get_albums(['vacations'])
    assert len(albums) == 1
    assert albums[0]['name'] == '2023'

    p1_id = b'2023/beach.jpg'.hex()
    answer = meta_store.get_asset_answer(p1_id)
    assert answer is not None
    assert answer.country == 'France'
    assert answer.latitude is not None

    # 2. Incremental Delta Sync (add a second photo in a new album)
    p2 = photos_dir / '2024' / 'alps.jpg'
    _create_test_image(p2, date_str='2024:01:20 15:30:00')

    await sync_engine.sync_library('vacations', force_full=False)

    state_delta = meta_store.get_sync_state('vacations')
    assert state_delta['sync_status'] == SyncStatus.idle.value
    assert state_delta['sync_mode'] == SyncMode.delta.value
    assert state_delta['total_assets'] == 2
    assert meta_store.count_library_assets('vacations') == 2
    assert callback.call_count == 2

    albums_delta = meta_store.get_albums(['vacations'])
    album_names = {a['name'] for a in albums_delta}
    assert album_names == {'2023', '2024'}

    # 3. Pruning on Full Sync (delete p1 from disk)
    p1.unlink()
    assert not p1.exists()

    await sync_engine.sync_library('vacations', force_full=True)

    state_pruned = meta_store.get_sync_state('vacations')
    assert state_pruned['total_assets'] == 1
    assert meta_store.count_library_assets('vacations') == 1
    assert meta_store.get_asset_answer(p1_id) is None

    p2_id = b'2024/alps.jpg'.hex()
    assert meta_store.get_asset_answer(p2_id) is not None


async def test_local_sync_missing_directory_records_error(
    tmp_path: Path,
    meta_store: MetadataStore,
) -> None:
    """Verify missing directory results in SyncStatus.error with diagnostic error details."""
    missing_dir = tmp_path / 'nonexistent_folder'
    provider = LocalFolderPhotoProvider({'broken': missing_dir})
    sync_engine = SyncEngine(provider, meta_store)

    with pytest.raises(Exception, match='does not exist'):
        await sync_engine.sync_library('broken')

    state = meta_store.get_sync_state('broken')
    assert state['sync_status'] == SyncStatus.error.value
    assert 'does not exist' in (state.get('sync_error') or '')


async def test_local_sync_game_query_compatibility(
    tmp_path: Path,
    meta_store: MetadataStore,
) -> None:
    """Verify assets indexed by LocalFolderPhotoProvider match gameplay filter criteria."""
    photos_dir = tmp_path / 'trips'
    img1 = photos_dir / 'summer' / 'photo1.jpg'
    _create_test_image(img1, date_str='2023:07:01 10:00:00')

    provider = LocalFolderPhotoProvider({'trips': photos_dir})
    sync_engine = SyncEngine(provider, meta_store)
    await sync_engine.sync_library('trips')

    # Query with AssetFilterCriteria
    setup = BaseGameConfig(
        libraries=['trips'],
        location_mode=True,
        date_mode=True,
    )
    criteria = AssetFilterCriteria.from_setup(setup)
    count = meta_store.count_eligible_assets(criteria)
    assert count == 1

    candidates = meta_store.fetch_candidate_assets(criteria, limit=5)
    assert len(candidates) == 1
    answer = next(iter(candidates.values()))
    assert answer.country == 'France'
