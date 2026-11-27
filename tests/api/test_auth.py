"""Unit and API integration tests for authentication and role-based access control."""

from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest
from conftest import FakeImmichClient
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.testclient import TestClient

from src.auth.models import AuthContext, Role
from src.auth.service import (
    _resolve_role_cloudflare,
    _resolve_role_disabled,
    require_role,
)
from src.config import AppSettings
from src.main import create_app


def test_role_enum_ordering() -> None:
    """Verify Role enum ordering and comparisons."""
    assert Role.GUEST < Role.USER < Role.CREATOR
    assert Role.CREATOR > Role.USER > Role.GUEST
    assert Role.USER >= Role.USER
    assert Role.USER >= Role.GUEST
    assert not (Role.GUEST >= Role.USER)
    assert not (Role.USER >= Role.CREATOR)


def test_auth_context_properties() -> None:
    """Verify AuthContext helper properties and methods."""
    guest_ctx = AuthContext(role=Role.GUEST)
    assert not guest_ctx.authenticated
    assert guest_ctx.role_label == 'guest'
    assert guest_ctx.has_role(Role.GUEST)
    assert not guest_ctx.has_role(Role.USER)
    assert not guest_ctx.has_role(Role.CREATOR)

    user_ctx = AuthContext(role=Role.USER, email='user@example.com', name='Alice')
    assert user_ctx.authenticated
    assert user_ctx.role_label == 'user'
    assert user_ctx.has_role(Role.GUEST)
    assert user_ctx.has_role(Role.USER)
    assert not user_ctx.has_role(Role.CREATOR)

    creator_ctx = AuthContext(role=Role.CREATOR, email='creator@example.com', name='Bob')
    assert creator_ctx.authenticated
    assert creator_ctx.role_label == 'creator'
    assert creator_ctx.has_role(Role.GUEST)
    assert creator_ctx.has_role(Role.USER)
    assert creator_ctx.has_role(Role.CREATOR)


def test_resolve_role_disabled() -> None:
    """When auth is disabled, role is always CREATOR."""
    ctx = _resolve_role_disabled()
    assert ctx.role == Role.CREATOR
    assert not ctx.authenticated


def test_resolve_role_cloudflare_resolution() -> None:
    """Verify Cloudflare header resolution against email allow-lists."""
    settings = AppSettings(
        immich_server_url='https://placeholder.example.com/api',
        immich_libraries={'family': 'token'},
        data_path=Path('/tmp'),
        auth_mode='cloudflare',
        cf_creator_emails=frozenset({'creator@example.com'}),
    )

    app = FastAPI()
    app.state.settings = settings

    def make_req(email: str | None) -> Request:
        headers: list[tuple[bytes, bytes]] = []
        if email is not None:
            headers.append((b'cf-access-authenticated-user-email', email.encode('utf-8')))
        scope = {
            'type': 'http',
            'app': app,
            'headers': headers,
        }
        return Request(scope)

    # 1. No header -> Guest
    ctx = _resolve_role_cloudflare(make_req(None))
    assert ctx.role == Role.GUEST
    assert not ctx.authenticated

    # 2. Empty or whitespace header -> Guest
    ctx = _resolve_role_cloudflare(make_req('   '))
    assert ctx.role == Role.GUEST
    assert not ctx.authenticated

    # 3. Creator email (case-insensitive) -> Creator
    ctx = _resolve_role_cloudflare(make_req('CREATOR@EXAMPLE.COM'))
    assert ctx.role == Role.CREATOR
    assert ctx.email == 'creator@example.com'
    assert ctx.authenticated

    # 4. Any authenticated non-creator email -> User
    ctx = _resolve_role_cloudflare(make_req('user1@example.com'))
    assert ctx.role == Role.USER
    assert ctx.email == 'user1@example.com'
    assert ctx.authenticated

    # 5. Any other authenticated email -> User
    ctx = _resolve_role_cloudflare(make_req('player2@example.com'))
    assert ctx.role == Role.USER
    assert ctx.email == 'player2@example.com'
    assert ctx.authenticated


@pytest.mark.asyncio
async def test_require_role_dependency_enforcement() -> None:
    """Verify require_role allows authorized callers and raises HTTP 403 for unauthorized callers."""
    creator_dep = require_role(Role.CREATOR)
    user_dep = require_role(Role.USER)

    creator_ctx = AuthContext(role=Role.CREATOR)
    user_ctx = AuthContext(role=Role.USER)
    guest_ctx = AuthContext(role=Role.GUEST)

    # Creator accessing Creator endpoint -> OK
    assert await creator_dep(creator_ctx) == creator_ctx
    # User accessing Creator endpoint -> 403
    with pytest.raises(HTTPException) as exc_info:
        await creator_dep(user_ctx)
    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    assert 'restricted to creators' in str(exc_info.value.detail)

    # Guest accessing User endpoint -> 403
    with pytest.raises(HTTPException) as exc_info:
        await user_dep(guest_ctx)
    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    assert 'restricted to users' in str(exc_info.value.detail)

    # User accessing User endpoint -> OK
    assert await user_dep(user_ctx) == user_ctx


def test_auth_me_endpoint_disabled_mode(tmp_path: Path) -> None:
    """GET /api/auth/me returns creator when auth_mode is disabled."""
    settings = AppSettings(
        immich_server_url='https://placeholder.example.com/api',
        immich_libraries={'family': 'token'},
        data_path=tmp_path,
        auth_mode='disabled',
    )
    app = create_app(settings=settings)
    app.state.photo_provider = FakeImmichClient()

    with TestClient(app) as client:
        resp = client.get('/api/auth/me')
        assert resp.status_code == 200
        data = resp.json()
        assert data['role'] == 'creator'
        assert data['email'] is None
        assert data['authenticated'] is False


def test_auth_me_and_route_rbac_cloudflare_mode(tmp_path: Path) -> None:
    """Integration test of GET /api/auth/me and RBAC route enforcement in Cloudflare mode."""
    creator_email = 'owner@example.com'
    user_email = 'player@example.com'

    settings = AppSettings(
        immich_server_url='https://placeholder.example.com/api',
        immich_libraries={'family': 'token'},
        data_path=tmp_path,
        auth_mode='cloudflare',
        cf_creator_emails=frozenset({creator_email}),
    )
    app = create_app(settings=settings)
    app.state.photo_provider = FakeImmichClient()

    with TestClient(app) as client:
        # 1. Unauthenticated / Guest request (no header)
        resp = client.get('/api/auth/me')
        assert resp.status_code == 200
        assert resp.json()['role'] == 'guest'
        assert resp.json()['authenticated'] is False

        # Guest trying to access Creator route (/api/libraries) -> 403
        resp = client.get('/api/libraries')
        assert resp.status_code == 403

        # Guest trying to access User route (/api/leaderboard) -> 403
        resp = client.get('/api/leaderboard')
        assert resp.status_code == 403

        # Guest trying to list challenges -> 403
        resp = client.get('/api/challenge/list')
        assert resp.status_code == 403

        # 2. User request (authenticated as user)
        user_headers = {'cf-access-authenticated-user-email': user_email}
        resp = client.get('/api/auth/me', headers=user_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data['role'] == 'user'
        assert data['email'] == user_email
        assert data['authenticated'] is True

        # User accessing User route (/api/leaderboard) -> 200
        resp = client.get('/api/leaderboard', headers=user_headers)
        assert resp.status_code == 200

        # User accessing User route (/api/challenge/list) -> 200
        resp = client.get('/api/challenge/list', headers=user_headers)
        assert resp.status_code == 200

        # User trying to access Creator route (/api/libraries) -> 403
        resp = client.get('/api/libraries', headers=user_headers)
        assert resp.status_code == 403

        # User trying to access Creator route (/api/game/setup) -> 403
        resp = client.post('/api/game/setup', json={'players': ['Alice']}, headers=user_headers)
        assert resp.status_code == 403

        # 3. Creator request (authenticated as creator)
        creator_headers = {'cf-access-authenticated-user-email': creator_email}
        resp = client.get('/api/auth/me', headers=creator_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data['role'] == 'creator'
        assert data['email'] == creator_email
        assert data['authenticated'] is True

        # Creator accessing Creator route (/api/libraries) -> 200
        resp = client.get('/api/libraries', headers=creator_headers)
        assert resp.status_code == 200

        # Creator accessing User route (/api/leaderboard) -> 200
        resp = client.get('/api/leaderboard', headers=creator_headers)
        assert resp.status_code == 200


def test_resolve_role_name_headers_and_jwt() -> None:
    """Verify display name resolution from custom headers and JWT assertion."""
    settings = AppSettings(
        immich_server_url='https://placeholder.example.com/api',
        immich_libraries={'family': 'token'},
        data_path=Path('/tmp'),
        auth_mode='cloudflare',
        cf_creator_emails=frozenset({'creator@example.com', 'admin_user'}),
    )
    app = FastAPI()
    app.state.settings = settings

    def make_req(headers_dict: dict[str, str]) -> Request:
        headers = [(k.lower().encode('utf-8'), v.encode('utf-8')) for k, v in headers_dict.items()]
        return Request({'type': 'http', 'app': app, 'headers': headers})

    # 1. Cloudflare dynamic name header + email
    ctx = _resolve_role_cloudflare(
        make_req(
            {
                'cf-access-authenticated-user-email': 'creator@example.com',
                'cf-access-authenticated-user-name': 'Player One',
            }
        )
    )
    assert ctx.role == Role.CREATOR
    assert ctx.email == 'creator@example.com'
    assert ctx.name == 'Player One'
    assert ctx.authenticated is True

    # 2. Reverse proxy / Caddy X-User-Name header without email, matched by username allowlist
    ctx = _resolve_role_cloudflare(make_req({'x-user-name': 'alice'}))
    assert ctx.role == Role.USER
    assert ctx.email is None
    assert ctx.name == 'alice'
    assert ctx.authenticated is True

    # 3. Reverse proxy X-Forwarded-User header
    ctx = _resolve_role_cloudflare(make_req({'x-forwarded-user': 'admin_user'}))
    assert ctx.role == Role.CREATOR
    assert ctx.name == 'admin_user'
    assert ctx.authenticated is True

    # 4. JWT assertion payload decoding
    claims = {'name': 'Alice Wonderland', 'email': 'user1@example.com', 'sub': '12345'}
    claims_json = json.dumps(claims).encode('utf-8')
    payload_b64 = base64.urlsafe_b64encode(claims_json).decode('ascii').rstrip('=')
    jwt_mock = f'header.{payload_b64}.signature'

    ctx = _resolve_role_cloudflare(make_req({'cf-access-jwt-assertion': jwt_mock}))
    assert ctx.role == Role.USER
    assert ctx.email == 'user1@example.com'
    assert ctx.name == 'Alice Wonderland'
    assert ctx.authenticated is True

    # 5. JWT assertion with Cloudflare Access OIDC attribute mapping (nested in oidc_fields)
    cf_oidc_claims = {
        'email': 'creator@example.com',
        'sub': '67890',
        'oidc_fields': {'name': 'Player One'},
    }
    cf_oidc_b64 = base64.urlsafe_b64encode(json.dumps(cf_oidc_claims).encode('utf-8')).decode('ascii').rstrip('=')
    ctx = _resolve_role_cloudflare(make_req({'cf-access-jwt-assertion': f'header.{cf_oidc_b64}.sig'}))
    assert ctx.role == Role.CREATOR
    assert ctx.email == 'creator@example.com'
    assert ctx.name == 'Player One'
    assert ctx.authenticated is True

    # 6. JWT assertion with deeply nested identity.oidc_fields and given_name/family_name
    nested_claims = {
        'sub': '11111',
        'identity': {
            'email': 'user1@example.com',
            'oidc_fields': {'given_name': 'Alice', 'family_name': 'Wonderland'},
        },
    }
    nested_b64 = base64.urlsafe_b64encode(json.dumps(nested_claims).encode('utf-8')).decode('ascii').rstrip('=')
    ctx = _resolve_role_cloudflare(make_req({'cf-access-jwt-assertion': f'header.{nested_b64}.sig'}))
    assert ctx.role == Role.USER
    assert ctx.email == 'user1@example.com'
    assert ctx.name == 'Alice Wonderland'
    assert ctx.authenticated is True

    # 7. Authenticated non-creator username only -> User with name preserved
    ctx = _resolve_role_cloudflare(make_req({'x-user-name': 'stranger'}))
    assert ctx.role == Role.USER
    assert ctx.name == 'stranger'
    assert ctx.authenticated is True

    # 8. Unauthenticated request with no headers -> Guest
    ctx = _resolve_role_cloudflare(make_req({}))
    assert ctx.role == Role.GUEST
    assert ctx.name is None
    assert ctx.authenticated is False


def test_resolve_role_loopback_dev_parameters() -> None:
    """Verify loopback dev overrides require BOTH allow_dev_auth=True and a loopback socket."""
    base_kwargs = {
        'immich_server_url': 'https://placeholder.example.com/api',
        'immich_libraries': {'family': 'token'},
        'data_path': Path('/tmp'),
        'auth_mode': 'cloudflare',
        'cf_creator_emails': frozenset({'dev@example.com'}),
    }

    def make_req(
        app: FastAPI,
        headers_dict: dict[str, str],
        query: str = '',
        client_ip: str = '127.0.0.1',
    ) -> Request:
        headers = [(k.lower().encode('utf-8'), v.encode('utf-8')) for k, v in headers_dict.items()]
        scope = {
            'type': 'http',
            'app': app,
            'client': (client_ip, 50000),
            'path': '/api/auth/me',
            'headers': headers,
            'query_string': query.encode('utf-8'),
        }
        return Request(scope)

    # 1. Default (allow_dev_auth=False): loopback dev headers and query params MUST be ignored
    locked_app = FastAPI()
    locked_app.state.settings = AppSettings(**base_kwargs)

    ctx = _resolve_role_cloudflare(make_req(locked_app, {'x-dev-email': 'dev@example.com', 'x-dev-name': 'Spoofer'}))
    assert ctx.role == Role.GUEST
    assert not ctx.authenticated

    ctx = _resolve_role_cloudflare(make_req(locked_app, {}, query='dev_email=dev@example.com&dev_name=Spoofer'))
    assert ctx.role == Role.GUEST
    assert not ctx.authenticated

    # 2. Explicit opt-in (allow_dev_auth=True) on loopback -> honored
    dev_app = FastAPI()
    dev_app.state.settings = AppSettings(**base_kwargs, allow_dev_auth=True)

    ctx = _resolve_role_cloudflare(make_req(dev_app, {'x-dev-email': 'dev@example.com', 'x-dev-name': 'Dev Master'}))
    assert ctx.role == Role.CREATOR
    assert ctx.email == 'dev@example.com'
    assert ctx.name == 'Dev Master'
    assert ctx.authenticated is True

    ctx = _resolve_role_cloudflare(make_req(dev_app, {}, query='dev_email=dev@example.com&dev_name=Dev+Param'))
    assert ctx.role == Role.CREATOR
    assert ctx.email == 'dev@example.com'
    assert ctx.name == 'Dev Param'
    assert ctx.authenticated is True

    # 3. Even with allow_dev_auth=True, non-loopback client IPs MUST be rejected
    ctx = _resolve_role_cloudflare(
        make_req(
            dev_app,
            {'x-dev-email': 'dev@example.com', 'x-dev-name': 'Remote Spoofer'},
            client_ip='203.0.113.42',
        )
    )
    assert ctx.role == Role.GUEST
    assert not ctx.authenticated


def _generate_test_rsa_keypair(seed: int = 42) -> tuple[int, int, int]:
    """Generate a deterministic 2048-bit RSA (n, e, d) keypair using stdlib Miller-Rabin."""
    import random

    rng = random.Random(seed)

    def _is_probable_prime(candidate: int) -> bool:
        if candidate % 2 == 0:
            return False
        small_primes = (3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53)
        for sp in small_primes:
            if candidate % sp == 0:
                return candidate == sp
        r, d_odd = 0, candidate - 1
        while d_odd % 2 == 0:
            r += 1
            d_odd //= 2
        for witness in (2, 3, 5, 7, 11, 13, 17, 19):
            x = pow(witness, d_odd, candidate)
            if x in (1, candidate - 1):
                continue
            for _ in range(r - 1):
                x = pow(x, 2, candidate)
                if x == candidate - 1:
                    break
            else:
                return False
        return True

    def _next_1024_bit_prime() -> int:
        val = rng.getrandbits(1024) | (1 << 1023) | (1 << 1022) | 1
        while not _is_probable_prime(val):
            val += 2
        return val

    e = 65537
    while True:
        p = _next_1024_bit_prime()
        q = _next_1024_bit_prime()
        if p == q:
            continue
        phi = (p - 1) * (q - 1)
        if phi % e != 0:
            n = p * q
            d = pow(e, -1, phi)
            return n, e, d


_RSA_KEY_PRIMARY = _generate_test_rsa_keypair(seed=101)
_RSA_KEY_OTHER = _generate_test_rsa_keypair(seed=202)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('ascii').rstrip('=')


def _build_jwk(keypair: tuple[int, int, int], kid: str) -> dict[str, str]:
    n, e, _ = keypair
    n_bytes = n.to_bytes((n.bit_length() + 7) // 8, 'big')
    e_bytes = e.to_bytes((e.bit_length() + 7) // 8, 'big')
    return {
        'kty': 'RSA',
        'kid': kid,
        'alg': 'RS256',
        'use': 'sig',
        'n': _b64url(n_bytes),
        'e': _b64url(e_bytes),
    }


def _sign_rs256_jwt(
    claims: dict[str, object],
    keypair: tuple[int, int, int],
    *,
    kid: str = 'cf-key-1',
    alg: str = 'RS256',
) -> str:
    import hashlib

    n, _, d = keypair
    k = (n.bit_length() + 7) // 8
    header_b64 = _b64url(json.dumps({'alg': alg, 'typ': 'JWT', 'kid': kid}).encode('utf-8'))
    payload_b64 = _b64url(json.dumps(claims).encode('utf-8'))
    signing_input = f'{header_b64}.{payload_b64}'.encode('ascii')
    digest_info = bytes.fromhex('3031300d060960864801650304020105000420') + hashlib.sha256(signing_input).digest()
    em = b'\x00\x01' + (b'\xff' * (k - len(digest_info) - 3)) + b'\x00' + digest_info
    sig = pow(int.from_bytes(em, 'big'), d, n).to_bytes(k, 'big')
    return f'{header_b64}.{payload_b64}.{_b64url(sig)}'


def test_auth_me_lock_player_name(tmp_path: Path) -> None:
    """Verify lock_player_name flag in GET /api/auth/me when CF_LOCK_PLAYER_NAME is enabled."""
    user_email = 'locked_user@example.com'
    settings = AppSettings(
        immich_server_url='https://placeholder.example.com/api',
        immich_libraries={'family': 'token'},
        data_path=tmp_path,
        auth_mode='cloudflare',
        cf_lock_player_name=True,
    )
    app = create_app(settings=settings)
    app.state.photo_provider = FakeImmichClient()

    with TestClient(app) as client:
        # 1. Unauthenticated guest -> lock_player_name is False
        resp = client.get('/api/auth/me')
        assert resp.status_code == 200
        assert resp.json()['lock_player_name'] is False

        # 2. Authenticated user -> lock_player_name is True
        headers = {
            'cf-access-authenticated-user-email': user_email,
            'cf-access-user-name': 'Verified Player',
        }
        resp = client.get('/api/auth/me', headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data['role'] == 'user'
        assert data['name'] == 'Verified Player'
        assert data['lock_player_name'] is True


def test_cloudflare_bypass_rejects_unverified_cookies_and_headers_without_team_domain(tmp_path: Path) -> None:
    """Without CF_TEAM_DOMAIN, unverified CF_Authorization cookies and X-User-* headers on /play/* resolve to Guest."""
    import time

    settings = AppSettings(
        immich_server_url='https://placeholder.example.com/api',
        immich_libraries={'family': 'token'},
        data_path=tmp_path,
        auth_mode='cloudflare',
        cf_creator_emails=frozenset({'owner@example.com'}),
        cf_lock_player_name=True,
    )
    app = create_app(settings=settings)
    app.state.photo_provider = FakeImmichClient()

    forged_claims = {'email': 'owner@example.com', 'name': 'Spoofed Owner', 'exp': int(time.time()) + 3600}
    forged_jwt = f'eyJhbGciOiJSUzI1NiJ9.{_b64url(json.dumps(forged_claims).encode("utf-8"))}.forgedsig'

    with TestClient(app) as client:
        # 1. Unauthenticated guest on /play/api/auth/me and /play/api/ui-config
        resp = client.get('/play/api/auth/me')
        assert resp.status_code == 200
        assert resp.json()['role'] == 'guest'
        assert resp.json()['authenticated'] is False

        cfg_resp = client.get('/play/api/ui-config')
        assert cfg_resp.status_code == 200
        assert 'tile_config' in cfg_resp.json()

        # 2. Forged CF_Authorization cookie without CF_TEAM_DOMAIN MUST NOT authenticate as Creator/User
        client.cookies.set('CF_Authorization', forged_jwt)
        resp = client.get('/play/api/auth/me')
        assert resp.status_code == 200
        data = resp.json()
        assert data['role'] == 'guest'
        assert data['authenticated'] is False
        assert data['lock_player_name'] is False

        # 3. Spoofed X-User-Name / X-Forwarded-Email / Cf-Access-Jwt-Assertion on /play/* MUST be rejected
        client.cookies.clear()
        resp = client.get(
            '/play/api/auth/me',
            headers={
                'X-User-Name': 'Spoofed Alice',
                'X-Forwarded-Email': 'owner@example.com',
                'Cf-Access-Jwt-Assertion': forged_jwt,
            },
        )
        assert resp.status_code == 200
        assert resp.json()['role'] == 'guest'
        assert resp.json()['authenticated'] is False


def test_cloudflare_jwks_verified_cookie_and_key_rotation(tmp_path: Path) -> None:
    """With CF_TEAM_DOMAIN and CF_AUD_TAG configured, verify RS256 JWKS signatures, claims, and key rotation."""
    import time

    import httpx

    from src.auth.service import clear_jwks_cache

    clear_jwks_cache()
    team_issuer = 'https://snapteam.cloudflareaccess.com'
    aud_tag = 'aud-snapguess-prod'
    active_keys = [_build_jwk(_RSA_KEY_PRIMARY, 'cf-key-1')]

    def _mock_certs_handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == f'{team_issuer}/cdn-cgi/access/certs'
        return httpx.Response(200, json={'keys': active_keys})

    settings = AppSettings(
        immich_server_url='https://placeholder.example.com/api',
        immich_libraries={'family': 'token'},
        data_path=tmp_path,
        auth_mode='cloudflare',
        cf_creator_emails=frozenset({'owner@example.com'}),
        cf_lock_player_name=True,
        cf_team_domain='snapteam',
        cf_aud_tags=frozenset({aud_tag}),
    )
    app = create_app(settings=settings)
    app.state.photo_provider = FakeImmichClient()
    app.state.cf_jwks_http_client = httpx.AsyncClient(transport=httpx.MockTransport(_mock_certs_handler))

    now = int(time.time())
    try:
        with TestClient(app) as client:
            # 1. Valid RS256-signed CF_Authorization cookie on /play/api/auth/me -> verified User
            valid_cookie = _sign_rs256_jwt(
                {
                    'iss': team_issuer,
                    'aud': [aud_tag],
                    'email': 'maria@example.com',
                    'oidc_fields': {'name': 'Maria Savi'},
                    'exp': now + 3600,
                },
                _RSA_KEY_PRIMARY,
                kid='cf-key-1',
            )
            client.cookies.set('CF_Authorization', valid_cookie)
            resp = client.get('/play/api/auth/me')
            assert resp.status_code == 200
            data = resp.json()
            assert data['role'] == 'user'
            assert data['email'] == 'maria@example.com'
            assert data['name'] == 'Maria Savi'
            assert data['authenticated'] is True
            assert data['lock_player_name'] is True

            # 2. Valid RS256-signed Creator token -> Role.CREATOR
            creator_cookie = _sign_rs256_jwt(
                {
                    'iss': team_issuer,
                    'aud': aud_tag,
                    'email': 'owner@example.com',
                    'name': 'Host Owner',
                    'exp': now + 3600,
                },
                _RSA_KEY_PRIMARY,
                kid='cf-key-1',
            )
            client.cookies.set('CF_Authorization', creator_cookie)
            resp = client.get('/play/api/auth/me')
            assert resp.json()['role'] == 'creator'
            assert resp.json()['authenticated'] is True

            # 3. Wrong RSA signing key (forged signature) -> Guest
            wrong_key_cookie = _sign_rs256_jwt(
                {
                    'iss': team_issuer,
                    'aud': [aud_tag],
                    'email': 'owner@example.com',
                    'exp': now + 3600,
                },
                _RSA_KEY_OTHER,
                kid='cf-key-1',
            )
            client.cookies.set('CF_Authorization', wrong_key_cookie)
            resp = client.get('/play/api/auth/me')
            assert resp.json()['role'] == 'guest'
            assert resp.json()['authenticated'] is False

            # 4. Wrong audience tag -> Guest
            wrong_aud_cookie = _sign_rs256_jwt(
                {
                    'iss': team_issuer,
                    'aud': ['some-other-app-aud'],
                    'email': 'owner@example.com',
                    'exp': now + 3600,
                },
                _RSA_KEY_PRIMARY,
                kid='cf-key-1',
            )
            client.cookies.set('CF_Authorization', wrong_aud_cookie)
            assert client.get('/play/api/auth/me').json()['role'] == 'guest'

            # 5. Wrong issuer -> Guest
            wrong_iss_cookie = _sign_rs256_jwt(
                {
                    'iss': 'https://evilteam.cloudflareaccess.com',
                    'aud': [aud_tag],
                    'email': 'owner@example.com',
                    'exp': now + 3600,
                },
                _RSA_KEY_PRIMARY,
                kid='cf-key-1',
            )
            client.cookies.set('CF_Authorization', wrong_iss_cookie)
            assert client.get('/play/api/auth/me').json()['role'] == 'guest'

            # 6. Expired token -> Guest
            expired_cookie = _sign_rs256_jwt(
                {
                    'iss': team_issuer,
                    'aud': [aud_tag],
                    'email': 'owner@example.com',
                    'exp': now - 120,
                },
                _RSA_KEY_PRIMARY,
                kid='cf-key-1',
            )
            client.cookies.set('CF_Authorization', expired_cookie)
            assert client.get('/play/api/auth/me').json()['role'] == 'guest'

            # 7. Key rotation: reset refresh cooldown, add cf-key-2 to JWKS, verify auto-refresh works
            from src.auth import service as auth_service

            auth_service._jwks_last_refresh_mono.clear()
            active_keys.append(_build_jwk(_RSA_KEY_OTHER, 'cf-key-2'))
            rotated_cookie = _sign_rs256_jwt(
                {
                    'iss': team_issuer,
                    'aud': [aud_tag],
                    'email': 'rotated@example.com',
                    'name': 'Rotated User',
                    'exp': now + 3600,
                },
                _RSA_KEY_OTHER,
                kid='cf-key-2',
            )
            client.cookies.set('CF_Authorization', rotated_cookie)
            resp = client.get('/play/api/auth/me')
            assert resp.json()['role'] == 'user'
            assert resp.json()['name'] == 'Rotated User'
    finally:
        clear_jwks_cache()
