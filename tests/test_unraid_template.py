"""Automated validation tests for the Unraid Community Applications XML template."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from src.config import load_settings

REPO_ROOT = Path(__file__).parent.parent
TEMPLATE_PATH = REPO_ROOT / 'deploy' / 'unraid' / 'snapguess.xml'
DOCKERFILE_PATH = REPO_ROOT / 'Dockerfile'


def _load_template_root() -> ET.Element:
    assert TEMPLATE_PATH.exists(), f'Unraid template missing at {TEMPLATE_PATH}'
    tree = ET.parse(TEMPLATE_PATH)
    return tree.getroot()


def test_unraid_xml_schema_and_metadata() -> None:
    """Verify required Unraid Community Applications (CA) metadata elements exist and are valid."""
    root = _load_template_root()
    assert root.tag == 'Container'
    assert root.attrib.get('version') == '2'

    required_non_empty_tags = (
        'Name',
        'Repository',
        'Registry',
        'Network',
        'Shell',
        'Privileged',
        'Support',
        'Project',
        'Overview',
        'Description',
        'Category',
        'WebUI',
        'TemplateURL',
        'Icon',
    )
    for tag in required_non_empty_tags:
        elem = root.find(tag)
        assert elem is not None, f'Missing required Unraid XML tag <{tag}>'
        assert elem.text and elem.text.strip(), f'Unraid XML tag <{tag}> must not be empty'

    assert root.findtext('Name') == 'SnapGuess'
    assert root.findtext('Repository') == 'ghcr.io/rafaelsavi/snapguess:latest'
    assert root.findtext('Privileged') == 'false'
    assert root.findtext('WebUI') == 'http://[IP]:[PORT:8010]'
    # ExtraParams must remain empty (no hardcoded --user) so entrypoint can initialize /app/data ownership cleanly
    extra_params = root.find('ExtraParams')
    assert extra_params is not None, 'Missing Unraid XML tag <ExtraParams>'
    assert '--user' not in (extra_params.text or '')


def test_unraid_template_urls_match_repo_files() -> None:
    """Verify that Icon and TemplateURL raw GitHub URLs correspond to real files in this repository."""
    root = _load_template_root()
    raw_prefix = 'https://raw.githubusercontent.com/rafaelsavi/snapguess/main/'

    icon_url = root.findtext('Icon') or ''
    assert icon_url.startswith(raw_prefix)
    icon_rel_path = icon_url.removeprefix(raw_prefix)
    assert (REPO_ROOT / icon_rel_path).is_file(), f'Icon asset {icon_rel_path} does not exist in repo'

    template_url = root.findtext('TemplateURL') or ''
    assert template_url.startswith(raw_prefix)
    template_rel_path = template_url.removeprefix(raw_prefix)
    assert (REPO_ROOT / template_rel_path).resolve() == TEMPLATE_PATH.resolve()


def test_unraid_configs_align_with_dockerfile() -> None:
    """Verify all <Config> elements carry required dockerMan attributes and align with Dockerfile."""
    root = _load_template_root()
    configs = root.findall('Config')
    assert len(configs) >= 8

    required_attrs = {
        'Name',
        'Target',
        'Default',
        'Mode',
        'Description',
        'Type',
        'Display',
        'Required',
        'Mask',
    }
    for cfg in configs:
        missing = required_attrs - set(cfg.attrib.keys())
        assert not missing, f'Config {cfg.attrib.get("Name")!r} missing attributes: {missing}'
        assert cfg.attrib['Type'] in {'Port', 'Path', 'Variable', 'Device'}
        assert cfg.attrib['Display'] in {'always', 'advanced', 'hidden'}
        assert cfg.attrib['Required'] in {'true', 'false'}
        assert cfg.attrib['Mask'] in {'true', 'false'}

    dockerfile_text = DOCKERFILE_PATH.read_text(encoding='utf-8')

    ports = [c for c in configs if c.attrib['Type'] == 'Port']
    assert len(ports) == 1
    port_target = ports[0].attrib['Target']
    assert f'EXPOSE {port_target}' in dockerfile_text

    paths = {c.attrib['Target']: c for c in configs if c.attrib['Type'] == 'Path'}
    assert '/app/data' in paths
    assert paths['/app/data'].attrib['Mode'] == 'rw'
    assert '/photos' in paths
    assert paths['/photos'].attrib['Mode'] == 'ro'
    # Keep default /photos path empty so Immich installs do not auto-create /mnt/user/photos on Unraid
    assert paths['/photos'].attrib['Default'] == ''
    assert not (paths['/photos'].text or '').strip()

    vars_map = {c.attrib['Target']: c for c in configs if c.attrib['Type'] == 'Variable'}
    assert vars_map['PUID'].attrib['Default'] == '99'
    assert (vars_map['PUID'].text or '').strip() == '99'
    assert vars_map['PGID'].attrib['Default'] == '100'
    assert (vars_map['PGID'].text or '').strip() == '100'


def test_dockerfile_entrypoint_and_compose_safety() -> None:
    """Verify Dockerfile entrypoint, LF line endings, runtime smoke checks, and Compose PUID/PGID config."""
    entrypoint_path = REPO_ROOT / 'docker-entrypoint.sh'
    compose_path = REPO_ROOT / 'docker-compose.example.yml'

    assert entrypoint_path.is_file(), 'docker-entrypoint.sh missing at repository root'
    raw_bytes = entrypoint_path.read_bytes()
    assert b'\r' not in raw_bytes, 'docker-entrypoint.sh must use LF line endings (no CRLF)'
    entrypoint_text = raw_bytes.decode('utf-8')
    assert entrypoint_text.startswith('#!/bin/sh\n')
    assert 'PUID' in entrypoint_text
    assert 'PGID' in entrypoint_text
    assert 'setpriv' in entrypoint_text
    assert '/photos' not in entrypoint_text

    dockerfile_text = DOCKERFILE_PATH.read_text(encoding='utf-8')
    assert 'COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh' in dockerfile_text
    assert 'chmod 0755 /usr/local/bin/docker-entrypoint.sh' in dockerfile_text
    assert 'ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]' in dockerfile_text
    assert 'CMD ["/app/.venv/bin/python", "-m", "src.main"]' in dockerfile_text
    assert 'pillow_heif' in dockerfile_text
    assert 'reverse_geocoder' in dockerfile_text
    assert 'USER 1000:1000' not in dockerfile_text

    compose_text = compose_path.read_text(encoding='utf-8')
    assert './data:/app/data' in compose_text
    assert 'PUID' in compose_text
    assert 'PGID' in compose_text
    active_user_lines = [line for line in compose_text.splitlines() if line.strip().startswith('user:')]
    assert not active_user_lines, (
        'docker-compose.example.yml should drop privileges via PUID/PGID instead of hardcoded user:'
    )


def test_unraid_template_variables_boot_with_load_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    """Feed the Unraid XML template environment variables directly into load_settings() for both providers."""
    monkeypatch.setattr('src.config.load_dotenv', lambda: None)
    root = _load_template_root()
    var_configs = {
        c.attrib['Target']: c.attrib['Default'] for c in root.findall('Config') if c.attrib.get('Type') == 'Variable'
    }

    # Clear existing env vars that could interfere and apply Unraid template defaults
    for key in list(var_configs.keys()):
        monkeypatch.delenv(key, raising=False)
    for key, default_val in var_configs.items():
        monkeypatch.setenv(key, default_val)

    # 1. Test default PHOTO_PROVIDER=immich configuration from template
    immich_settings = load_settings()
    assert immich_settings.photo_provider == 'immich'
    assert immich_settings.immich_server_url == 'http://192.168.1.100:2283/api'
    assert immich_settings.immich_libraries == {'Family': 'replace-with-api-key'}
    assert immich_settings.auth_mode == 'disabled'
    assert immich_settings.auto_sync_on_startup is True

    # 2. Test PHOTO_PROVIDER=local configuration from template
    monkeypatch.setenv('PHOTO_PROVIDER', 'local')
    local_settings = load_settings()
    assert local_settings.photo_provider == 'local'
    assert local_settings.local_libraries == {'Family': '/photos'}
