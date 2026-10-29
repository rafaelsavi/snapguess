#!/usr/bin/env python3
"""Programmatic generator for README documentation screenshots and animated gameplay GIF.

Spins up an isolated, ephemeral FastAPI server backed by 100% synthetic vector/raster
travel artwork and deterministic metadata, then drives a headless Chromium browser via
Playwright through a full multiplayer match to capture:
  - docs/assets/gameplay.gif          (Animated end-to-end gameplay showcase)
  - docs/assets/home.webp             (Setup Lobby, Smart Filters & Leaderboard)
  - docs/assets/gameplay_pinpoint.webp (Pinpoint Interactive Guessing)
  - docs/assets/round_reveal.webp     (Round Reveal & Distance Vectors)
  - docs/assets/summary_podium.webp   (Winner Podium, Awards & Review Deck)
"""

from __future__ import annotations

import asyncio
import contextlib
import io
import socket
import sys
import tempfile
import threading
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import uvicorn
from PIL import Image, ImageDraw
from playwright.async_api import Page, async_playwright

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from src.config import AppSettings  # noqa: E402
from src.main import create_app  # noqa: E402
from src.models import AssetAnswer, BaseGameConfig, GameMode, PlayMode, RoundLength, SyncStatus  # noqa: E402
from src.storage.metadata import MetadataStore  # noqa: E402
from src.storage.session import MatchState, RoundAsset, RoundData  # noqa: E402
from tests.conftest import CityInfo, FakeImmichClient, PersonInfo, TimelineBounds  # noqa: E402

ASSETS_DIR = REPO_ROOT / 'docs' / 'assets'

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
)


def _lerp_color(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return (
        int(c1[0] + (c2[0] - c1[0]) * t),
        int(c1[1] + (c2[1] - c1[1]) * t),
        int(c1[2] + (c2[2] - c1[2]) * t),
    )


def _draw_vertical_gradient(
    draw: ImageDraw.ImageDraw,
    width: int,
    y0: int,
    y1: int,
    stops: list[tuple[float, tuple[int, int, int]]],
) -> None:
    span = max(1, y1 - y0)
    for y in range(y0, y1):
        pos = (y - y0) / span
        color = stops[-1][1]
        for idx in range(len(stops) - 1):
            p0, col0 = stops[idx]
            p1, col1 = stops[idx + 1]
            if p0 <= pos <= p1:
                local_t = (pos - p0) / max(1e-6, p1 - p0)
                color = _lerp_color(col0, col1, local_t)
                break
        draw.line([(0, y), (width, y)], fill=color)


def render_synthetic_scene(scene_key: str, width: int = 1200, height: int = 800) -> bytes:
    """Generate a rich, anonymized synthetic travel landscape illustration as JPEG bytes."""
    img = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(img)
    horizon_y = int(height * 0.64)

    if scene_key == 'paris':
        # Warm golden-hour sunset over Paris & the Seine
        _draw_vertical_gradient(
            draw,
            width,
            0,
            horizon_y,
            [
                (0.0, (28, 36, 84)),
                (0.35, (112, 58, 108)),
                (0.7, (224, 112, 82)),
                (1.0, (252, 198, 116)),
            ],
        )
        # Glowing setting sun
        sun_x, sun_y = int(width * 0.34), int(height * 0.44)
        for r, col in [(110, (253, 210, 130)), (75, (254, 230, 160)), (44, (255, 248, 210))]:
            draw.ellipse([sun_x - r, sun_y - r, sun_x + r, sun_y + r], fill=col)

        # Distant Paris skyline silhouette
        skyline_pts = [
            (0, horizon_y),
            (0, horizon_y - 38),
            (180, horizon_y - 42),
            (220, horizon_y - 58),
            (310, horizon_y - 45),
            (480, horizon_y - 52),
            (720, horizon_y - 48),
            (890, horizon_y - 64),
            (1040, horizon_y - 44),
            (width, horizon_y - 50),
            (width, horizon_y),
        ]
        draw.polygon(skyline_pts, fill=(44, 28, 52))

        # Eiffel Tower silhouette at right-center
        tx = int(width * 0.64)
        base_w = 130
        tower_top = int(height * 0.12)
        tower_poly = [
            (tx - base_w, horizon_y),
            (tx - 58, int(height * 0.48)),
            (tx - 32, int(height * 0.32)),
            (tx - 12, int(height * 0.18)),
            (tx - 3, tower_top),
            (tx + 3, tower_top),
            (tx + 12, int(height * 0.18)),
            (tx + 32, int(height * 0.32)),
            (tx + 58, int(height * 0.48)),
            (tx + base_w, horizon_y),
        ]
        draw.polygon(tower_poly, fill=(32, 20, 42))
        # Spire
        draw.line([(tx, tower_top - 36), (tx, tower_top)], fill=(32, 20, 42), width=4)
        # Base arch cutout
        draw.pieslice(
            [tx - 52, horizon_y - 52, tx + 52, horizon_y + 52],
            start=180,
            end=360,
            fill=(242, 178, 106),
        )
        # Observation decks
        draw.rectangle([tx - 72, int(height * 0.48) - 6, tx + 72, int(height * 0.48) + 6], fill=(24, 15, 34))
        draw.rectangle([tx - 42, int(height * 0.32) - 5, tx + 42, int(height * 0.32) + 5], fill=(24, 15, 34))

        # Seine river reflection
        _draw_vertical_gradient(
            draw,
            width,
            horizon_y,
            height,
            [
                (0.0, (218, 134, 94)),
                (0.45, (118, 64, 92)),
                (1.0, (34, 28, 58)),
            ],
        )
        # Shimmering water highlights
        for idx in range(18):
            ry = horizon_y + 12 + idx * 14
            half_w = max(12, 85 - idx * 3 + (idx % 3) * 14)
            draw.line([(sun_x - half_w, ry), (sun_x + half_w, ry)], fill=(255, 226, 156), width=3)

        # Bridge silhouette with arches
        bridge_y = horizon_y + 18
        draw.rectangle([0, bridge_y - 14, width, bridge_y], fill=(26, 18, 36))
        for arch_x in range(80, width, 180):
            draw.pieslice(
                [arch_x - 55, bridge_y - 10, arch_x + 55, bridge_y + 38],
                start=180,
                end=360,
                fill=(195, 115, 90),
            )

    elif scene_key == 'rome':
        # Mediterranean warm afternoon over the Colosseum
        _draw_vertical_gradient(
            draw,
            width,
            0,
            horizon_y,
            [
                (0.0, (38, 106, 176)),
                (0.55, (108, 174, 218)),
                (1.0, (246, 218, 172)),
            ],
        )
        # Warm ground plaza
        _draw_vertical_gradient(
            draw,
            width,
            horizon_y,
            height,
            [
                (0.0, (186, 142, 98)),
                (1.0, (96, 68, 46)),
            ],
        )
        # Colosseum tiered facade
        cx0, cx1 = int(width * 0.22), int(width * 0.78)
        cy_top = int(height * 0.28)
        draw.rectangle([cx0, cy_top + 65, cx1, horizon_y], fill=(214, 168, 118))
        draw.rectangle([cx0, cy_top, int(width * 0.62), cy_top + 70], fill=(224, 180, 128))
        # Arches across 3 tiers
        for tier_idx, tier_y in enumerate([horizon_y - 52, horizon_y - 115, horizon_y - 175]):
            max_x = int(width * 0.60) if tier_idx == 2 else cx1 - 24
            for ax in range(cx0 + 28, max_x, 48):
                draw.rectangle([ax, tier_y, ax + 24, tier_y + 38], fill=(72, 48, 34))
                draw.pieslice([ax, tier_y - 12, ax + 24, tier_y + 12], 180, 360, fill=(72, 48, 34))

    elif scene_key == 'tokyo':
        # Spring twilight with Mount Fuji & pagoda
        _draw_vertical_gradient(
            draw,
            width,
            0,
            horizon_y,
            [
                (0.0, (24, 28, 68)),
                (0.45, (88, 56, 118)),
                (0.8, (216, 108, 138)),
                (1.0, (250, 192, 168)),
            ],
        )
        # Mount Fuji silhouette
        fx = int(width * 0.42)
        fuji_pts = [
            (fx - 380, horizon_y),
            (fx - 140, int(height * 0.36)),
            (fx - 48, int(height * 0.24)),
            (fx + 48, int(height * 0.24)),
            (fx + 140, int(height * 0.36)),
            (fx + 380, horizon_y),
        ]
        draw.polygon(fuji_pts, fill=(58, 48, 92))
        # Snow cap
        snow_pts = [
            (fx - 48, int(height * 0.24)),
            (fx + 48, int(height * 0.24)),
            (fx + 102, int(height * 0.32)),
            (fx + 52, int(height * 0.30)),
            (fx, int(height * 0.34)),
            (fx - 52, int(height * 0.30)),
            (fx - 102, int(height * 0.32)),
        ]
        draw.polygon(snow_pts, fill=(246, 244, 252))

        # Five-story pagoda silhouette on right hillside
        px = int(width * 0.78)
        for roof_idx in range(5):
            ry = horizon_y - 45 - roof_idx * 38
            rw = 82 - roof_idx * 9
            draw.polygon(
                [(px - rw, ry + 14), (px - rw + 18, ry), (px + rw - 18, ry), (px + rw, ry + 14)],
                fill=(32, 20, 44),
            )
            draw.rectangle([px - rw // 2, ry + 14, px + rw // 2, ry + 38], fill=(44, 26, 56))

        _draw_vertical_gradient(
            draw,
            width,
            horizon_y,
            height,
            [(0.0, (46, 34, 68)), (1.0, (18, 14, 34))],
        )

    elif scene_key == 'rio':
        # Tropical coastal bay & Sugarloaf Mountain
        _draw_vertical_gradient(
            draw,
            width,
            0,
            horizon_y,
            [
                (0.0, (18, 124, 196)),
                (0.6, (88, 198, 234)),
                (1.0, (250, 232, 168)),
            ],
        )
        # Sugarloaf peak
        draw.polygon(
            [
                (int(width * 0.52), horizon_y),
                (int(width * 0.62), int(height * 0.28)),
                (int(width * 0.68), int(height * 0.26)),
                (int(width * 0.76), int(height * 0.42)),
                (int(width * 0.88), horizon_y),
            ],
            fill=(34, 88, 78),
        )
        # Turquoise ocean & sandy beach curve
        _draw_vertical_gradient(
            draw,
            width,
            horizon_y,
            height,
            [(0.0, (22, 164, 178)), (0.65, (14, 112, 142)), (1.0, (238, 206, 148))],
        )

    else:
        # New York skyline at dusk
        _draw_vertical_gradient(
            draw,
            width,
            0,
            horizon_y,
            [
                (0.0, (18, 26, 58)),
                (0.55, (64, 84, 138)),
                (1.0, (238, 152, 98)),
            ],
        )
        heights = [90, 140, 110, 210, 165, 260, 180, 135, 220, 150, 195, 120, 95]
        bw = width // len(heights)
        for idx, bh in enumerate(heights):
            bx0 = idx * bw + 6
            bx1 = (idx + 1) * bw - 4
            draw.rectangle([bx0, horizon_y - bh, bx1, horizon_y], fill=(28, 34, 56))
        _draw_vertical_gradient(
            draw,
            width,
            horizon_y,
            height,
            [(0.0, (52, 68, 108)), (1.0, (18, 24, 44))],
        )

    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=92)
    return buf.getvalue()


class ShowcasePhotoProvider(FakeImmichClient):
    """Photo provider serving rich synthetic travel illustrations for each asset."""

    def __init__(self, *args: Any, scene_bytes: dict[str, bytes], **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._scene_bytes = scene_bytes
        self._default_bytes = next(iter(scene_bytes.values()))

    async def get_asset_bytes(self, library_name: str, asset_id: str) -> tuple[bytes, str]:
        return self._scene_bytes.get(asset_id, self._default_bytes), 'image/jpeg'


def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return int(s.getsockname()[1])


def build_showcase_assets() -> tuple[list[dict[str, Any]], dict[str, bytes]]:
    """Build deterministic showcase assets and their matching illustrated scenes."""
    scenes = {
        'paris': render_synthetic_scene('paris'),
        'rome': render_synthetic_scene('rome'),
        'tokyo': render_synthetic_scene('tokyo'),
        'rio': render_synthetic_scene('rio'),
        'newyork': render_synthetic_scene('newyork'),
    }

    destinations = [
        (
            'paris',
            'Paris',
            'France',
            48.8584,
            2.2945,
            '2022-04-18T17:30:00Z',
            'p1',
            'Alice',
            'album-1',
            'European Classics',
        ),
        (
            'rome',
            'Rome',
            'Italy',
            41.8902,
            12.4922,
            '2021-09-12T15:10:00Z',
            'p2',
            'Bob',
            'album-1',
            'European Classics',
        ),
        (
            'tokyo',
            'Tokyo',
            'Japan',
            35.6586,
            139.7454,
            '2023-03-25T18:15:00Z',
            'p3',
            'Charlie',
            'album-2',
            'World Wonders',
        ),
        (
            'rio',
            'Rio de Janeiro',
            'Brazil',
            -22.9519,
            -43.2105,
            '2020-11-08T16:45:00Z',
            'p1',
            'Alice',
            'album-3',
            'Summer Escapes',
        ),
        (
            'newyork',
            'New York',
            'United States',
            40.6892,
            -74.0445,
            '2019-07-04T19:20:00Z',
            'p2',
            'Bob',
            'album-2',
            'World Wonders',
        ),
    ]

    assets: list[dict[str, Any]] = []
    scene_by_asset_id: dict[str, bytes] = {}

    # Create 25 rich assets across the 5 destinations so preflight count looks healthy
    for copy_idx in range(5):
        for scene_key, city, country, lat, lon, dt_str, pid, pname, albid, albname in destinations:
            aid = f'asset-{scene_key}-{copy_idx + 1}'
            offset = copy_idx * 0.004
            year = int(dt_str[:4]) - (copy_idx % 2)
            adj_dt = f'{year}{dt_str[4:]}'
            assets.append(
                {
                    'id': aid,
                    'type': 'IMAGE',
                    'exifInfo': {
                        'latitude': lat + offset,
                        'longitude': lon + offset,
                        'city': city,
                        'country': country,
                        'dateTimeOriginal': adj_dt,
                    },
                    'fileCreatedAt': adj_dt,
                    'people': [{'id': pid, 'name': pname}],
                    'albums': [{'id': albid, 'name': albname}],
                }
            )
            scene_by_asset_id[aid] = scenes[scene_key]

    return assets, scene_by_asset_id


def seed_showcase_data(store: MetadataStore, library_name: str, assets: list[dict[str, Any]]) -> None:
    people_data = [
        {'id': 'p1', 'name': 'Alice'},
        {'id': 'p2', 'name': 'Bob'},
        {'id': 'p3', 'name': 'Charlie'},
    ]
    store.upsert_people(library_name, people_data)

    albums_data = [
        {'id': 'album-1', 'name': 'European Classics', 'isShared': 0},
        {'id': 'album-2', 'name': 'World Wonders', 'isShared': 0},
        {'id': 'album-3', 'name': 'Summer Escapes', 'isShared': 0},
    ]
    store.upsert_albums(library_name, albums_data)

    asset_records: list[dict[str, Any]] = []
    asset_people: list[tuple[str, str]] = []
    asset_albums: list[tuple[str, str]] = []
    asset_tags: list[tuple[str, str]] = []

    for a in assets:
        aid = a['id']
        exif = a['exifInfo']
        asset_records.append(
            {
                'id': aid,
                'is_shared': 0,
                'is_partner': 0,
                'file_type': 'IMAGE',
                'latitude': float(exif['latitude']),
                'longitude': float(exif['longitude']),
                'country': exif['country'],
                'city': exif['city'],
                'capture_datetime': exif['dateTimeOriginal'],
            }
        )
        for p in a.get('people', []):
            asset_people.append((aid, p['id']))
        for alb in a.get('albums', []):
            asset_albums.append((aid, alb['id']))

    store.upsert_assets_batch(library_name, asset_records, asset_people, asset_albums, asset_tags)
    store.set_sync_state(
        library_name,
        status=SyncStatus.idle,
        total_assets=len(asset_records),
        synced_assets=len(asset_records),
    )


async def wait_for_leaflet_tiles(page: Page, map_selector: str, timeout_ms: int = 4000) -> None:
    """Wait briefly for Leaflet tiles in the given container to finish loading."""
    with contextlib.suppress(Exception):
        await page.wait_for_function(
            """(sel) => {
                const container = document.querySelector(sel);
                if (!container) return false;
                const tiles = Array.from(container.querySelectorAll('.leaflet-tile'));
                return tiles.length > 0 && tiles.every(
                    t => t.complete || t.classList.contains('leaflet-tile-loaded')
                );
            }""",
            arg=map_selector,
            timeout=timeout_ms,
        )
    await page.wait_for_timeout(300)


def save_webp(png_bytes: bytes, dest: Path, quality: int = 90) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(io.BytesIO(png_bytes)) as im:
        im.save(dest, format='WEBP', quality=quality, method=6)


def add_gif_frame(
    frames: list[tuple[Image.Image, int]],
    png_bytes: bytes,
    duration_ms: int,
    size: tuple[int, int] = (960, 600),
    cursor_pos: tuple[int, int] | None = None,
    click_ripple: bool = False,
) -> None:
    """Decode a viewport screenshot, optionally draw a cursor/click indicator, and append to GIF frames."""
    with Image.open(io.BytesIO(png_bytes)) as raw:
        frame = raw.convert('RGBA').resize(size, Image.Resampling.LANCZOS)

    if cursor_pos is not None:
        overlay = Image.new('RGBA', size, (0, 0, 0, 0))
        odraw = ImageDraw.Draw(overlay)
        cx, cy = cursor_pos
        if click_ripple:
            odraw.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], outline=(59, 130, 246, 210), width=3)
            odraw.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=(59, 130, 246, 95))
        # Crisp pointer arrow with white border
        pointer = [
            (cx, cy),
            (cx, cy + 20),
            (cx + 5, cy + 15),
            (cx + 9, cy + 23),
            (cx + 13, cy + 21),
            (cx + 9, cy + 13),
            (cx + 15, cy + 13),
        ]
        odraw.polygon(pointer, fill=(15, 23, 42, 245), outline=(255, 255, 255, 255))
        frame = Image.alpha_composite(frame, overlay)

    frames.append((frame.convert('RGB'), duration_ms))


def save_animated_gif(frames: list[tuple[Image.Image, int]], dest: Path) -> None:
    """Quantize RGB frames against a shared global palette so inter-frame delta compression is maximal."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Build a composite sample strip from key frames to derive an optimal 256-color global palette
    sample_step = max(1, len(frames) // 8)
    samples = [frames[i][0].resize((240, 170), Image.Resampling.BILINEAR) for i in range(0, len(frames), sample_step)]
    strip = Image.new('RGB', (240 * len(samples), 170))
    for idx, s_img in enumerate(samples):
        strip.paste(s_img, (idx * 240, 0))
    global_palette = strip.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)

    quantized: list[Image.Image] = []
    durations: list[int] = []
    for rgb_img, dur in frames:
        p_img = rgb_img.quantize(palette=global_palette, dither=Image.Dither.NONE)
        quantized.append(p_img)
        durations.append(dur)

    quantized[0].save(
        dest,
        format='GIF',
        save_all=True,
        append_images=quantized[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )


async def capture_all_assets(base_url: str) -> None:
    gif_frames: list[tuple[Image.Image, int]] = []
    vp_w, vp_h = 1360, 960
    gif_w, gif_h = 960, 678

    def scale_pt(x: float, y: float) -> tuple[int, int]:
        return (int(x * gif_w / vp_w), int(y * gif_h / vp_h))

    def push_gif(
        png_bytes: bytes,
        duration_ms: int,
        cursor_pos: tuple[int, int] | None = None,
        click_ripple: bool = False,
    ) -> None:
        add_gif_frame(
            gif_frames,
            png_bytes,
            duration_ms,
            size=(gif_w, gif_h),
            cursor_pos=cursor_pos,
            click_ripple=click_ripple,
        )

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': vp_w, 'height': vp_h},
            device_scale_factor=2,
            base_url=base_url,
            locale='en-US',
            user_agent=USER_AGENT,
        )
        page = await context.new_page()

        # ------------------------------------------------------------------
        # 1. Setup Lobby & Smart Filters (docs/assets/home.webp)
        # ------------------------------------------------------------------
        await page.goto('/')
        await page.locator('#setup-card').wait_for(state='visible')
        await page.locator('#round-count button[data-value="5"]').click()
        await page.wait_for_timeout(400)

        # Capture initial lobby frame for GIF (showing Setup + Preflight + Leaderboard)
        push_gif(await page.screenshot(), 950)

        # Expand Smart Filters accordion to showcase cascading filters
        accordion_header = page.locator('#filters-accordion-header')
        hdr_box = await accordion_header.bounding_box()
        if hdr_box:
            pt = scale_pt(hdr_box['x'] + hdr_box['width'] * 0.3, hdr_box['y'] + hdr_box['height'] * 0.5)
            push_gif(await page.screenshot(), 450, cursor_pos=pt, click_ripple=True)
        await accordion_header.click()
        await page.locator('#filters-accordion-content').wait_for(state='visible')
        await page.evaluate(
            '() => document.getElementById("setup-card").scrollIntoView({ behavior: "instant", block: "start" })'
        )
        await page.wait_for_timeout(350)

        # Save high-res Setup Lobby screenshot
        home_png = await page.screenshot()
        save_webp(home_png, ASSETS_DIR / 'home.webp')
        push_gif(home_png, 1150)

        # Collapse filters back and click Prepare Game
        await accordion_header.click()
        await page.evaluate('() => window.scrollTo({ top: 0, behavior: "instant" })')
        await page.wait_for_timeout(200)

        prepare_btn = page.locator('#prepare-game-btn')
        prep_box = await prepare_btn.bounding_box()
        if prep_box:
            pt = scale_pt(prep_box['x'] + prep_box['width'] * 0.5, prep_box['y'] + prep_box['height'] * 0.5)
            push_gif(await page.screenshot(), 500, cursor_pos=pt, click_ripple=True)
        await prepare_btn.click()

        modal = page.locator('#prepare-game-modal')
        await modal.wait_for(state='visible')
        await page.wait_for_timeout(250)

        # Clear default Host chip so we have clean Alice, Bob, Charlie
        remove_btns = page.locator('#player-chips-wrap .player-chip-remove')
        while await remove_btns.count() > 0:
            await remove_btns.first.click()
            await page.wait_for_timeout(60)

        player_input = page.locator('#player-text-input')
        for pname in ('Alice', 'Bob', 'Charlie'):
            await player_input.fill(pname)
            await page.keyboard.press('Enter')
            await page.wait_for_timeout(100)

        push_gif(await page.screenshot(), 950)

        start_btn = page.locator('#start-match-btn')
        start_box = await start_btn.bounding_box()
        if start_box:
            pt = scale_pt(start_box['x'] + start_box['width'] * 0.5, start_box['y'] + start_box['height'] * 0.5)
            push_gif(await page.screenshot(), 450, cursor_pos=pt, click_ripple=True)
        await start_btn.click()

        # ------------------------------------------------------------------
        # 2. Pinpoint Interactive Guessing & 5-Round Match
        # ------------------------------------------------------------------
        await page.locator('#game-card').wait_for(state='visible')

        round_guesses_by_player = [
            # Round 0: Paris
            [
                (48.86, 2.34, '2022', '4'),  # Alice: spot-on in Paris
                (45.76, 4.83, '2021', '7'),  # Bob: Lyon
                (50.85, 4.35, '2022', '5'),  # Charlie: Brussels
            ],
            # Round 1: Rome
            [
                (41.90, 12.50, '2021', '9'),  # Alice: Rome
                (45.46, 9.19, '2020', '5'),  # Bob: Milan
                (43.77, 11.25, '2021', '10'),  # Charlie: Florence
            ],
            # Round 2: Tokyo
            [
                (35.68, 139.76, '2023', '3'),  # Alice: Tokyo
                (34.69, 135.50, '2022', '8'),  # Bob: Osaka
                (35.01, 135.76, '2023', '4'),  # Charlie: Kyoto
            ],
            # Round 3: Rio de Janeiro
            [
                (-22.96, -43.18, '2020', '11'),  # Alice: Rio
                (-23.55, -46.63, '2019', '6'),  # Bob: Sao Paulo
                (-25.43, -49.27, '2020', '9'),  # Charlie: Curitiba
            ],
            # Round 4: New York
            [
                (40.71, -74.01, '2019', '7'),  # Alice: NYC
                (42.36, -71.06, '2018', '11'),  # Bob: Boston
                (39.95, -75.16, '2019', '8'),  # Charlie: Philadelphia
            ],
        ]

        for round_idx in range(5):
            for p_idx, _pname in enumerate(('Alice', 'Bob', 'Charlie')):
                await page.locator('#pass-overlay').wait_for(state='visible')
                await page.locator('#ready-btn').click()
                await page.locator('#pass-overlay').wait_for(state='hidden')

                await page.locator('#guessing-ui').wait_for(state='visible')
                await page.wait_for_function(
                    '() => document.getElementById("game-card").getBoundingClientRect().top <= 40'
                )

                g_lat, g_lng, g_year, g_month = round_guesses_by_player[round_idx][p_idx]

                if round_idx == 0 and p_idx == 0:
                    # Scroll so photo, map, date selector, and submit button all fit cleanly in viewport
                    await page.evaluate(
                        """() => {
                            const submitBtn = document.getElementById('submit-answer');
                            if (submitBtn) {
                                submitBtn.scrollIntoView({ behavior: 'instant', block: 'end' });
                            }
                            const map = document.getElementById('guess-map')?._leaflet_map;
                            if (map) {
                                map.setView([48.2, 3.2], 5, { animate: false });
                                map.invalidateSize();
                            }
                        }"""
                    )
                    await wait_for_leaflet_tiles(page, '#guess-map')
                    push_gif(await page.screenshot(), 900)

                    # Drop Alice's pin right near Paris
                    await page.evaluate(
                        """([lat, lng]) => {
                            const map = document.getElementById('guess-map')?._leaflet_map;
                            if (map) {
                                map.fire('click', { latlng: L.latLng(lat, lng) });
                            }
                        }""",
                        [g_lat, g_lng],
                    )
                    await page.wait_for_timeout(250)

                    # Select April 2022
                    await page.locator('#date-guess-year').select_option(g_year)
                    await page.locator('#date-guess-month').select_option(g_month)
                    await page.wait_for_timeout(250)

                    # Capture Pinpoint Interactive Guessing screenshot (docs/assets/gameplay_pinpoint.webp)
                    pinpoint_png = await page.screenshot()
                    save_webp(pinpoint_png, ASSETS_DIR / 'gameplay_pinpoint.webp')

                    pin_box = await page.locator('#guess-map .player-pin').first.bounding_box()
                    if pin_box:
                        pt = scale_pt(pin_box['x'] + pin_box['width'] * 0.5, pin_box['y'] + pin_box['height'] * 0.8)
                        push_gif(pinpoint_png, 1150, cursor_pos=pt, click_ripple=True)
                    else:
                        push_gif(pinpoint_png, 1150)

                    sub_box = await page.locator('#submit-answer').bounding_box()
                    if sub_box:
                        pt = scale_pt(sub_box['x'] + sub_box['width'] * 0.5, sub_box['y'] + sub_box['height'] * 0.5)
                        push_gif(pinpoint_png, 500, cursor_pos=pt, click_ripple=True)

                else:
                    await page.evaluate(
                        """([lat, lng]) => {
                            const map = document.getElementById('guess-map')?._leaflet_map;
                            if (map) {
                                map.fire('click', { latlng: L.latLng(lat, lng) });
                            }
                        }""",
                        [g_lat, g_lng],
                    )
                    await page.locator('#date-guess-year').select_option(g_year)
                    await page.locator('#date-guess-month').select_option(g_month)

                await page.locator('#submit-answer').click()

            # ------------------------------------------------------------------
            # 3. Round Reveal & Distance Vectors (docs/assets/round_reveal.webp)
            # ------------------------------------------------------------------
            await page.locator('#reveal-ui').wait_for(state='visible')
            if round_idx == 0:
                await page.evaluate(
                    """() => {
                        const card = document.getElementById('game-card');
                        if (card) card.scrollIntoView({ behavior: 'instant', block: 'start' });
                    }"""
                )
                await wait_for_leaflet_tiles(page, '#reveal-map')
                # Wait for score rollup animation to finish
                await page.wait_for_timeout(1100)
                reveal_png = await page.screenshot()
                save_webp(reveal_png, ASSETS_DIR / 'round_reveal.webp')
                push_gif(reveal_png, 1450)

                next_box = await page.locator('#next-round').bounding_box()
                if next_box:
                    pt = scale_pt(next_box['x'] + next_box['width'] * 0.5, next_box['y'] + next_box['height'] * 0.5)
                    push_gif(reveal_png, 450, cursor_pos=pt, click_ripple=True)

            await page.locator('#next-round').click()

        # ------------------------------------------------------------------
        # 4. Winner Podium & Review Deck (docs/assets/summary_podium.webp)
        # ------------------------------------------------------------------
        await page.locator('#summary-card').wait_for(state='visible')
        await page.evaluate(
            """() => {
                const card = document.getElementById('summary-card');
                if (card) card.scrollIntoView({ behavior: 'instant', block: 'start' });
            }"""
        )
        await wait_for_leaflet_tiles(page, '#summary-replay-map')
        await page.wait_for_timeout(800)

        summary_png = await page.screenshot()
        save_webp(summary_png, ASSETS_DIR / 'summary_podium.webp')
        push_gif(summary_png, 1450)

        # Scroll down in the GIF to showcase the 3-tab Review Deck (Round Replay -> Photo Memories)
        await page.evaluate(
            """() => {
                const deck = (
                    document.querySelector('.review-deck-card') ||
                    document.getElementById('summary-replay-map')
                );
                if (deck) deck.scrollIntoView({ behavior: 'instant', block: 'center' });
            }"""
        )
        await wait_for_leaflet_tiles(page, '#summary-replay-map')
        await page.wait_for_timeout(350)
        push_gif(await page.screenshot(), 1150)

        memories_tab = page.locator('[data-deck-tab="memories"]')
        mem_box = await memories_tab.bounding_box()
        if mem_box:
            pt = scale_pt(mem_box['x'] + mem_box['width'] * 0.5, mem_box['y'] + mem_box['height'] * 0.5)
            push_gif(await page.screenshot(), 450, cursor_pos=pt, click_ripple=True)
        await memories_tab.click()
        await page.locator('#polaroid-gallery').wait_for(state='visible')
        await page.wait_for_timeout(400)
        push_gif(await page.screenshot(), 1350)

        await context.close()
        await browser.close()

    save_animated_gif(gif_frames, ASSETS_DIR / 'gameplay.gif')


def main() -> None:
    print('[*] Rendering synthetic travel illustrations...')
    assets, scene_bytes = build_showcase_assets()

    with tempfile.TemporaryDirectory(prefix='snapguess_screenshots_') as tmp_dir:
        data_path = Path(tmp_dir)
        port = get_free_port()

        provider = ShowcasePhotoProvider(
            assets=assets,
            scene_bytes=scene_bytes,
            people=[
                PersonInfo(id='p1', name='Alice'),
                PersonInfo(id='p2', name='Bob'),
                PersonInfo(id='p3', name='Charlie'),
            ],
            timeline_bounds=TimelineBounds(min_date=date(2018, 1, 1), max_date=date(2024, 12, 31)),
            countries=['Brazil', 'France', 'Italy', 'Japan', 'United States'],
            cities=[
                CityInfo(name='Paris', country='France'),
                CityInfo(name='Rome', country='Italy'),
                CityInfo(name='Tokyo', country='Japan'),
                CityInfo(name='Rio de Janeiro', country='Brazil'),
                CityInfo(name='New York', country='United States'),
            ],
        )

        settings = AppSettings(
            immich_server_url='https://photos.example.com/api',
            immich_libraries={'family': 'demo-token'},
            app_title='SnapGuess',
            app_host='127.0.0.1',
            app_port=port,
            language='en-US',
            data_path=data_path,
            auto_sync_on_startup=False,
        )

        app = create_app(settings=settings)
        app.state.photo_provider = provider
        seed_showcase_data(app.state.metadata_store, 'family', assets)

        # Deterministically pre-populate rounds 0..4 when a match is created
        orig_create_match = app.state.session_store.create_match

        def deterministic_create_match(setup: Any) -> MatchState:
            state = orig_create_match(setup)
            curated = [
                (
                    'asset-paris-1',
                    48.8584,
                    2.2945,
                    'Paris',
                    'France',
                    datetime(2022, 4, 18, 17, 30, tzinfo=timezone.utc),
                ),
                ('asset-rome-1', 41.8902, 12.4922, 'Rome', 'Italy', datetime(2021, 9, 12, 15, 10, tzinfo=timezone.utc)),
                (
                    'asset-tokyo-1',
                    35.6586,
                    139.7454,
                    'Tokyo',
                    'Japan',
                    datetime(2023, 3, 25, 18, 15, tzinfo=timezone.utc),
                ),
                (
                    'asset-rio-1',
                    -22.9519,
                    -43.2105,
                    'Rio de Janeiro',
                    'Brazil',
                    datetime(2020, 11, 8, 16, 45, tzinfo=timezone.utc),
                ),
                (
                    'asset-newyork-1',
                    40.6892,
                    -74.0445,
                    'New York',
                    'United States',
                    datetime(2019, 7, 4, 19, 20, tzinfo=timezone.utc),
                ),
            ]
            for r_idx, (aid, lat, lon, city, country, cdt) in enumerate(curated):
                state.rounds[r_idx] = RoundData(
                    assets=[
                        RoundAsset(
                            asset_id=aid,
                            answer=AssetAnswer(
                                latitude=lat,
                                longitude=lon,
                                city=city,
                                country=country,
                                capture_datetime=cdt,
                            ),
                        )
                    ]
                )
            return state

        app.state.session_store.create_match = deterministic_create_match

        # Seed leaderboard with realistic entries for the lobby view
        lb_store = app.state.leaderboard_store
        seed_cfg = BaseGameConfig(
            libraries=['family'],
            round_count=5,
            round_length=RoundLength.seconds_30,
            location_mode=True,
            date_mode=True,
            game_mode=GameMode.pinpoint,
        )
        lb_store.append_match(
            match_id='seed-match-1',
            config=seed_cfg,
            player_scores={
                'Alice': {'location': 480, 'date': 465, 'total': 945},
                'Charlie': {'location': 440, 'date': 422, 'total': 862},
                'Bob': {'location': 400, 'date': 389, 'total': 789},
                'Diana': {'location': 375, 'date': 366, 'total': 741},
            },
            play_mode=PlayMode.local,
            duration_seconds=95.0,
            player_times={'Alice': 28.4, 'Charlie': 34.1, 'Bob': 41.2, 'Diana': 45.0},
        )

        config = uvicorn.Config(app=app, host='127.0.0.1', port=port, log_level='warning')
        server = uvicorn.Server(config=config)

        def run_server() -> None:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(server.serve())
            finally:
                loop.close()

        thread = threading.Thread(target=run_server, daemon=True)
        thread.start()

        base_url = f'http://127.0.0.1:{port}'
        deadline = time.time() + 10.0
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(f'{base_url}/') as resp:
                    if resp.status == 200:
                        break
            except Exception:
                time.sleep(0.05)

        try:
            print(f'[*] Capturing screenshots and gameplay GIF from {base_url}...')
            asyncio.run(capture_all_assets(base_url))
        finally:
            server.should_exit = True
            thread.join(timeout=3.0)

    for fname in ('gameplay.gif', 'home.webp', 'gameplay_pinpoint.webp', 'round_reveal.webp', 'summary_podium.webp'):
        fpath = ASSETS_DIR / fname
        size_kb = fpath.stat().st_size / 1024
        print(f'[+] Generated {fpath.relative_to(REPO_ROOT)} ({size_kb:.1f} KB)')


if __name__ == '__main__':
    main()
