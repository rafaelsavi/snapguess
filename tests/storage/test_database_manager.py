"""Unit tests for DatabaseManager directory/permission diagnostics and SQLite error handling."""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

import pytest

from src.storage.db import DatabaseManager


def test_database_manager_reports_unwritable_parent_dir(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Raise a clear PermissionError when the data directory is not writable."""
    data_dir = tmp_path / 'appdata'
    data_dir.mkdir(parents=True, exist_ok=True)
    db_file = data_dir / 'metadata.db'

    real_access = os.access

    def fake_access(path: object, mode: int) -> bool:
        if Path(str(path)) == data_dir:
            return False
        return real_access(str(path), mode)

    monkeypatch.setattr('src.storage.db.os.access', fake_access)

    with pytest.raises(PermissionError, match='PUID/PGID') as exc_info:
        DatabaseManager(db_file)
    assert 'write to data directory' in str(exc_info.value)


def test_database_manager_reports_unwritable_existing_db_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Raise a clear PermissionError when an existing database file lacks write permissions."""
    data_dir = tmp_path / 'appdata'
    data_dir.mkdir(parents=True, exist_ok=True)
    db_file = data_dir / 'metadata.db'
    db_file.write_bytes(b'')

    real_access = os.access

    def fake_access(path: object, mode: int) -> bool:
        if Path(str(path)) == db_file:
            return False
        return real_access(str(path), mode)

    monkeypatch.setattr('src.storage.db.os.access', fake_access)

    with pytest.raises(PermissionError, match='PUID/PGID') as exc_info:
        DatabaseManager(db_file)
    assert 'write to SQLite database' in str(exc_info.value)


def test_database_manager_translates_sqlite_readonly_operational_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Convert SQLite readonly/unable-to-open errors during WAL setup into actionable PermissionError."""
    db_file = tmp_path / 'metadata.db'

    @contextmanager
    def failing_connection(_self: DatabaseManager) -> object:
        raise sqlite3.OperationalError('attempt to write a readonly database')
        yield  # pragma: no cover

    monkeypatch.setattr(DatabaseManager, 'connection', failing_connection)

    with pytest.raises(PermissionError, match='PUID/PGID') as exc_info:
        DatabaseManager(db_file)
    assert 'open SQLite database' in str(exc_info.value)


def test_database_manager_preserves_unrelated_sqlite_operational_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Propagate non-permission SQLite OperationalErrors unchanged."""
    db_file = tmp_path / 'metadata.db'

    @contextmanager
    def failing_connection(_self: DatabaseManager) -> object:
        raise sqlite3.OperationalError('disk I/O error')
        yield  # pragma: no cover

    monkeypatch.setattr(DatabaseManager, 'connection', failing_connection)

    with pytest.raises(sqlite3.OperationalError, match='disk I/O error'):
        DatabaseManager(db_file)
