"""Authentication service: header parsing, Cloudflare JWKS verification, role resolution, and FastAPI dependencies."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from collections.abc import Mapping, Sequence
from typing import Any

import httpx
from cachetools import TTLCache
from fastapi import Depends, HTTPException, Request, status

from src.app_logging import get_logger
from src.auth.models import AuthContext, Role

logger = get_logger('auth')

# Cloudflare Access & reverse proxy (Caddy/Traefik/Nginx) identity headers
_CF_EMAIL_HEADERS = (
    'cf-access-authenticated-user-email',
    'x-auth-email',
    'x-user-email',
    'x-forwarded-email',
)

_CF_NAME_HEADERS = (
    'cf-access-authenticated-user-name',
    'cf-access-user-name',
    'x-user-name',
    'x-auth-name',
    'x-forwarded-user-name',
    'x-forwarded-user',
    'remote-user',
)

# Strictly Cloudflare-injected edge headers permitted on /play/* when CF_TEAM_DOMAIN is unset
_CF_STRICT_EDGE_NAME_HEADERS = (
    'cf-access-authenticated-user-name',
    'cf-access-user-name',
)

_CF_JWT_HEADER = 'cf-access-jwt-assertion'
_CF_AUTH_COOKIE = 'CF_Authorization'

# RFC 8017 Section 9.2 DigestInfo DER prefix for SHA-256 in EMSA-PKCS1-v1_5
_DER_SHA256_PREFIX = bytes.fromhex('3031300d060960864801650304020105000420')

# Cached Cloudflare Access public signing keys: team_domain_url -> list of RSA JWK dicts
_jwks_cache: TTLCache[str, list[dict[str, Any]]] = TTLCache(maxsize=16, ttl=3600)
_jwks_last_refresh_mono: dict[str, float] = {}
_JWKS_MIN_REFRESH_INTERVAL_SECONDS = 60.0


def clear_jwks_cache() -> None:
    """Clear cached Cloudflare JWKS public keys and refresh timestamps."""
    _jwks_cache.clear()
    _jwks_last_refresh_mono.clear()


def _b64url_decode(segment: str) -> bytes:
    """Decode an unpadded or padded URL-safe base64 string into raw bytes."""
    padded = segment + ('=' * (-len(segment) % 4))
    return base64.urlsafe_b64decode(padded.encode('ascii'))


def _verify_rs256_jwk(signing_input: bytes, signature: bytes, jwk: Mapping[str, Any]) -> bool:
    """Verify an RSASSA-PKCS1-v1_5 SHA-256 (RS256) JWT signature against a JWK public key.

    Implements full-block deterministic RFC 8017 EMSA-PKCS1-v1_5 comparison using
    constant-time ``hmac.compare_digest`` and enforces >= 2048-bit RSA modulus sizes.
    """
    try:
        if jwk.get('kty') != 'RSA':
            return False
        if jwk.get('use') not in (None, 'sig'):
            return False
        if jwk.get('alg') not in (None, 'RS256'):
            return False

        raw_n = jwk.get('n')
        raw_e = jwk.get('e')
        if not isinstance(raw_n, str) or not isinstance(raw_e, str) or not raw_n or not raw_e:
            return False

        n = int.from_bytes(_b64url_decode(raw_n), 'big')
        e = int.from_bytes(_b64url_decode(raw_e), 'big')
        k = (n.bit_length() + 7) // 8

        if k < 256 or e < 3 or (e % 2 == 0) or len(signature) != k:
            return False

        sig_int = int.from_bytes(signature, 'big')
        if sig_int < 0 or sig_int >= n:
            return False

        em = pow(sig_int, e, n).to_bytes(k, 'big')
        digest_info = _DER_SHA256_PREFIX + hashlib.sha256(signing_input).digest()
        ps_len = k - len(digest_info) - 3
        if ps_len < 8:
            return False

        expected_em = b'\x00\x01' + (b'\xff' * ps_len) + b'\x00' + digest_info
        return hmac.compare_digest(em, expected_em)
    except Exception as exc:
        logger.debug('RS256 JWK signature check failed: %s', exc)
        return False


def _extract_claims_from_payload(data: Mapping[str, Any]) -> tuple[str | None, str | None]:
    """Extract (display_name, lowercase_email) from a decoded JWT payload dictionary."""
    containers: list[Mapping[str, Any]] = [data]
    for key in ('oidc_fields', 'identity', 'custom', 'custom_claims', 'user_identity'):
        val = data.get(key)
        if isinstance(val, dict):
            containers.append(val)
            if key == 'identity':
                nested_oidc = val.get('oidc_fields')
                if isinstance(nested_oidc, dict):
                    containers.append(nested_oidc)

    name: str | None = None
    for container in containers:
        for claim in ('name', 'preferred_username', 'user_name', 'nickname', 'display_name'):
            v = container.get(claim)
            if isinstance(v, str) and v.strip():
                name = v.strip()
                break
        if name:
            break

        given = container.get('given_name')
        if isinstance(given, str) and given.strip():
            family = container.get('family_name')
            name = f'{given.strip()} {family.strip()}' if isinstance(family, str) and family.strip() else given.strip()
            break

    email: str | None = None
    for container in containers:
        for claim in ('email', 'user_email', 'mail'):
            v = container.get(claim)
            if isinstance(v, str) and v.strip():
                email = v.strip().lower()
                break
        if email:
            break

    return name, email


def _extract_identity_from_jwt(jwt_token: str) -> tuple[str | None, str | None]:
    """Extract display name and email claims from an unverified JWT assertion payload.

    Used ONLY on non-bypass routes when ``CF_TEAM_DOMAIN`` is not configured and an
    upstream edge proxy terminates authentication before forwarding to SnapGuess.
    """
    parts = jwt_token.strip().split('.')
    if len(parts) != 3:
        return None, None
    try:
        data = json.loads(_b64url_decode(parts[1]))
        if not isinstance(data, dict):
            return None, None

        exp = data.get('exp')
        if isinstance(exp, (int, float)) and exp < time.time():
            return None, None

        return _extract_claims_from_payload(data)
    except Exception as exc:
        logger.debug('Failed to decode JWT assertion claims: %s', exc)
        return None, None


def verify_cf_jwt_with_keys(
    jwt_token: str,
    keys: Sequence[Mapping[str, Any]],
    *,
    expected_issuer: str,
    expected_auds: frozenset[str] = frozenset(),
    clock_skew_seconds: int = 30,
) -> tuple[str | None, str | None] | None:
    """Cryptographically verify a Cloudflare Access JWT against JWKS keys and standard claims.

    Returns ``(name, email)`` when signature, issuer, expiration, and optional audience
    all validate; returns ``None`` otherwise.
    """
    parts = jwt_token.strip().split('.')
    if len(parts) != 3 or not keys:
        return None

    header_b64, payload_b64, sig_b64 = parts
    try:
        header = json.loads(_b64url_decode(header_b64))
        payload = json.loads(_b64url_decode(payload_b64))
        signature = _b64url_decode(sig_b64)
    except Exception as exc:
        logger.debug('Malformed Cloudflare JWT segments: %s', exc)
        return None

    if not isinstance(header, dict) or not isinstance(payload, dict):
        return None
    if header.get('alg') != 'RS256':
        return None

    now = time.time()
    exp = payload.get('exp')
    if not isinstance(exp, (int, float)) or exp < (now - clock_skew_seconds):
        return None

    nbf = payload.get('nbf')
    if nbf is not None and (not isinstance(nbf, (int, float)) or nbf > (now + clock_skew_seconds)):
        return None

    iss = str(payload.get('iss') or '').strip().rstrip('/').lower()
    norm_expected_iss = expected_issuer.strip().rstrip('/').lower()
    if not iss or iss != norm_expected_iss:
        return None

    if expected_auds:
        raw_aud = payload.get('aud')
        if isinstance(raw_aud, str):
            token_auds = {raw_aud.strip()}
        elif isinstance(raw_aud, list):
            token_auds = {str(item).strip() for item in raw_aud if str(item).strip()}
        else:
            token_auds = set()
        if not (token_auds & expected_auds):
            return None

    kid = header.get('kid')
    if isinstance(kid, str) and kid.strip():
        candidate_keys = [k for k in keys if k.get('kid') == kid.strip()]
    else:
        candidate_keys = list(keys)

    if not candidate_keys:
        return None

    signing_input = f'{header_b64}.{payload_b64}'.encode('ascii')
    if not any(_verify_rs256_jwk(signing_input, signature, jwk) for jwk in candidate_keys):
        return None

    return _extract_claims_from_payload(payload)


async def fetch_cf_jwks(
    team_domain_url: str,
    *,
    force_refresh: bool = False,
    http_client: httpx.AsyncClient | None = None,
) -> list[dict[str, Any]]:
    """Fetch and TTL-cache Cloudflare Access RSA public keys from ``/cdn-cgi/access/certs``."""
    norm_domain = team_domain_url.rstrip('/')
    cached = _jwks_cache.get(norm_domain)
    now_mono = time.monotonic()

    if cached is not None and not force_refresh:
        return cached

    if cached is not None and force_refresh:
        last_refresh = _jwks_last_refresh_mono.get(norm_domain, 0.0)
        if (now_mono - last_refresh) < _JWKS_MIN_REFRESH_INTERVAL_SECONDS:
            return cached

    certs_url = f'{norm_domain}/cdn-cgi/access/certs'
    try:
        if http_client is not None:
            resp = await http_client.get(certs_url, timeout=5.0)
        else:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(certs_url)
        resp.raise_for_status()
        body = resp.json()
        raw_keys = body.get('keys', []) if isinstance(body, dict) else []
        keys = [dict(k) for k in raw_keys if isinstance(k, dict) and k.get('kty') == 'RSA']
        if keys:
            _jwks_cache[norm_domain] = keys
            _jwks_last_refresh_mono[norm_domain] = now_mono
            return keys
    except Exception as exc:
        logger.warning('Failed to fetch Cloudflare Access JWKS from %s: %s', certs_url, exc)

    return cached or []


async def _verify_request_cf_jwt(request: Request) -> tuple[tuple[str | None, str | None] | None, bool]:
    """Verify incoming Cloudflare JWT header or cookie when ``settings.cf_team_domain`` is configured.

    Returns ``(verified_identity_or_none, jwt_present)``.
    """
    settings = request.app.state.settings
    team_domain = getattr(settings, 'cf_team_domain', '')
    if not team_domain:
        return None, False

    jwt_token = request.headers.get(_CF_JWT_HEADER) or request.cookies.get(_CF_AUTH_COOKIE)
    if not jwt_token or not jwt_token.strip():
        return None, False

    http_client: httpx.AsyncClient | None = getattr(request.app.state, 'cf_jwks_http_client', None)
    keys = await fetch_cf_jwks(team_domain, force_refresh=False, http_client=http_client)
    aud_tags: frozenset[str] = getattr(settings, 'cf_aud_tags', frozenset())

    # If the token specifies a rotated kid not in cache, attempt one rate-limited refresh
    parts = jwt_token.strip().split('.')
    if len(parts) == 3 and keys:
        try:
            hdr = json.loads(_b64url_decode(parts[0]))
            kid = hdr.get('kid') if isinstance(hdr, dict) else None
            if isinstance(kid, str) and kid.strip() and not any(k.get('kid') == kid.strip() for k in keys):
                keys = await fetch_cf_jwks(team_domain, force_refresh=True, http_client=http_client)
        except Exception:
            pass

    verified = verify_cf_jwt_with_keys(
        jwt_token,
        keys,
        expected_issuer=team_domain,
        expected_auds=aud_tags,
    )
    return verified, True


def _resolve_role_cloudflare(
    request: Request,
    *,
    verified_jwt_identity: tuple[str | None, str | None] | None = None,
    jwt_present: bool = False,
) -> AuthContext:
    """Resolve role and identity from Cloudflare Access headers, verified JWTs, or reverse proxies.

    Security rules:
    1. ``CF_Authorization`` cookies are ONLY trusted when cryptographically verified via ``CF_TEAM_DOMAIN``.
    2. Public ``/play/*`` Bypass paths reject unverified cookies, unverified JWT assertions, and generic
       reverse-proxy headers (``X-User-Name``, ``X-Forwarded-User``, etc.).
    3. Loopback development overrides (``x-dev-*`` / ``?dev_*``) require explicit ``ALLOW_DEV_AUTH=true``.
    """
    settings = request.app.state.settings
    team_domain = getattr(settings, 'cf_team_domain', '')
    allow_dev_auth = bool(getattr(settings, 'allow_dev_auth', False))
    req_path = str(request.scope.get('path') or '')
    is_play_route = req_path.startswith('/play/')

    raw_email: str | None = None
    raw_name: str | None = None

    if team_domain:
        if verified_jwt_identity is not None:
            jwt_name, jwt_email = verified_jwt_identity
            raw_name = jwt_name
            raw_email = jwt_email
            if not raw_name and not is_play_route:
                for hdr in _CF_NAME_HEADERS:
                    if (val := request.headers.get(hdr)) and val.strip():
                        raw_name = val.strip()
                        break
        elif not jwt_present and not is_play_route:
            # Allow trusted non-Cloudflare reverse-proxy headers on protected /api/* routes when no JWT was sent
            for hdr in _CF_EMAIL_HEADERS:
                if (val := request.headers.get(hdr)) and val.strip():
                    raw_email = val.strip()
                    break
            for hdr in _CF_NAME_HEADERS:
                if (val := request.headers.get(hdr)) and val.strip():
                    raw_name = val.strip()
                    break
    else:
        if is_play_route:
            # On public /play/* routes without CF_TEAM_DOMAIN JWKS verification:
            # Never trust CF_Authorization cookies, unverified JWTs, or generic X-User-* headers.
            # Only honor Cloudflare's own authenticated email header when /play/* is behind an Allow policy.
            cf_edge_email = request.headers.get('cf-access-authenticated-user-email')
            if cf_edge_email and cf_edge_email.strip():
                raw_email = cf_edge_email.strip()
                for hdr in _CF_STRICT_EDGE_NAME_HEADERS:
                    if (val := request.headers.get(hdr)) and val.strip():
                        raw_name = val.strip()
                        break
        else:
            for hdr in _CF_EMAIL_HEADERS:
                if (val := request.headers.get(hdr)) and val.strip():
                    raw_email = val.strip()
                    break
            for hdr in _CF_NAME_HEADERS:
                if (val := request.headers.get(hdr)) and val.strip():
                    raw_name = val.strip()
                    break
            # Only inspect header assertion on protected /api/* routes (never unverified cookies)
            if jwt_hdr := request.headers.get(_CF_JWT_HEADER):
                jwt_name, jwt_email = _extract_identity_from_jwt(jwt_hdr)
                if not raw_name and jwt_name:
                    raw_name = jwt_name
                if not raw_email and jwt_email:
                    raw_email = jwt_email

    # Explicit opt-in local development hook (requires BOTH ALLOW_DEV_AUTH=true and loopback socket)
    client_host = request.client.host if request.client else ''
    is_loopback = client_host in ('127.0.0.1', 'localhost', '::1', 'testclient')

    if allow_dev_auth and is_loopback:
        if not raw_email or not raw_email.strip():
            raw_email = request.headers.get('x-dev-email') or request.query_params.get('dev_email')
        if not raw_name or not raw_name.strip():
            raw_name = request.headers.get('x-dev-name') or request.query_params.get('dev_name')

    if (not raw_email or not raw_email.strip()) and (not raw_name or not raw_name.strip()):
        return AuthContext(role=Role.GUEST)

    email = raw_email.strip().lower() if raw_email and raw_email.strip() else None

    if raw_name and raw_name.strip():
        name = raw_name.strip()
    elif email:
        name = email.split('@')[0].capitalize()
    else:
        name = None

    identifiers: set[str] = set()
    if email:
        identifiers.add(email)
    if name:
        identifiers.add(name.lower())

    if identifiers & settings.cf_creator_emails:
        return AuthContext(role=Role.CREATOR, email=email, name=name)

    return AuthContext(role=Role.USER, email=email, name=name)


def _resolve_role_disabled(settings: Any = None) -> AuthContext:
    """When auth is disabled everyone is a Creator (backward-compatible default)."""
    return AuthContext(role=Role.CREATOR, email=None, name='Host')


async def get_current_auth(request: Request) -> AuthContext:
    """FastAPI dependency that resolves the current request's :class:`AuthContext`."""
    settings = request.app.state.settings
    mode = settings.auth_mode

    if mode == 'disabled':
        return _resolve_role_disabled(settings)

    if mode == 'cloudflare':
        verified_jwt, jwt_present = await _verify_request_cf_jwt(request)
        return _resolve_role_cloudflare(
            request,
            verified_jwt_identity=verified_jwt,
            jwt_present=jwt_present,
        )

    logger.warning('Unknown AUTH_MODE %r, falling back to disabled (Creator for all)', mode)
    return _resolve_role_disabled(settings)


def require_role(min_role: Role):
    """Return a FastAPI dependency that enforces a minimum role level."""

    async def _dependency(auth: AuthContext = Depends(get_current_auth)) -> AuthContext:
        if not auth.has_role(min_role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f'Access restricted to {min_role.name.lower()}s.',
            )
        return auth

    return _dependency
