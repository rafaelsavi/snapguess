"""End-to-End tests verifying mobile and desktop zoom/pan in Photo Lightbox:
- Double tap / double click quick-zoom to 2.5x
- Reset zoom button appearance, scale label, and click-to-reset
- Mouse wheel zooming
- Escape key hierarchical handling (resets zoom first, then closes)
"""

from __future__ import annotations

import json
import re

import pytest
from playwright.async_api import Page, expect

MOCK_REPLAY_DATA = {
    'match_id': 'test-zoom-match',
    'game_mode': 'pinpoint',
    'play_mode': 'local',
    'rounds': 1,
    'played_at': 1740000000.0,
    'location_mode': True,
    'date_mode': False,
    'config': {
        'round_count': 1,
        'round_length': '1m',
        'location_mode': True,
        'date_mode': False,
        'game_mode': 'pinpoint',
        'libraries': ['Familia Savi'],
    },
    'rounds_data': [
        {
            'round_number': 1,
            'asset_id': 'asset-zoom-1',
            'actual_latitude': 48.8584,
            'actual_longitude': 2.2945,
            'actual_city': 'Paris',
            'actual_country': 'France',
            'actual_date': '2023-05-15T14:30:00.000Z',
            'player_guesses': [
                {
                    'player_name': 'Alice',
                    'player_color': '#3b82f6',
                    'guess_latitude': 48.8600,
                    'guess_longitude': 2.3000,
                    'distance_km': 0.45,
                    'round_score': 4980,
                    'cumulative_score': 4980,
                    'time_taken_seconds': 12,
                }
            ],
        }
    ],
}


# Minimal valid 100x100 PNG
DUMMY_PNG = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x64\x00\x00\x00\x64\x08\x02'
    b'\x00\x00\x00\x07x\x83\x85\x00\x00\x00\x1bIDATx\x9cc\xf8\xcf\xc0\x00\x03\x03'
    b'\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x00\x00\x18\x0b\x01\x01\xc6\xe13\xeb'
    b'\x00\x00\x00\x00IEND\xaeB`\x82'
)


@pytest.mark.asyncio
async def test_lightbox_zoom_double_tap_and_reset(page: Page) -> None:
    """Verify that photo lightbox supports double-click/double-tap zoom, reset button, and key dismissal."""

    async def handle_replay_route(route):
        await route.fulfill(
            status=200,
            content_type='application/json',
            body=json.dumps(MOCK_REPLAY_DATA),
        )

    async def handle_media_route(route):
        await route.fulfill(
            status=200,
            content_type='image/png',
            body=DUMMY_PNG,
        )

    await page.route('**/api/match/test-zoom-match/replay', handle_replay_route)
    await page.route('**/api/media/**', handle_media_route)

    # 1. Navigate to replay page
    await page.goto('/game/test-zoom-match/replay')
    await expect(page.locator('#summary-card')).to_be_visible()

    photo_img = page.locator('#replay-photo-img')
    await expect(photo_img).to_be_visible()

    # 2. Open photo in lightbox
    await photo_img.click()
    lightbox = page.locator('#photo-lightbox')
    await expect(lightbox).to_be_visible()
    await expect(lightbox).to_have_class('photo-lightbox-overlay active')

    lightbox_img = page.locator('#photo-lightbox-img')
    reset_btn = page.locator('.photo-lightbox-zoom-reset')
    reset_label = page.locator('.photo-lightbox-zoom-label')

    # Initially at 1.0x, reset button is hidden
    await expect(reset_btn).to_have_class(re.compile(r'hidden'))
    await expect(lightbox).not_to_have_class(re.compile(r'is-zoomed'))

    # 3. Double-click to zoom in (2.5x)
    await lightbox_img.dblclick()
    await expect(lightbox).to_have_class(re.compile(r'is-zoomed'))
    await expect(reset_btn).not_to_have_class(re.compile(r'hidden'))
    await expect(reset_label).to_have_text('2.5x')

    # 4. Click reset button to return to 1.0x
    await reset_btn.click()
    await expect(lightbox).not_to_have_class(re.compile(r'is-zoomed'))
    await expect(reset_btn).to_have_class(re.compile(r'hidden'))

    # 5. Double click to zoom again, then test Escape key hierarchy
    await lightbox_img.dblclick()
    await expect(lightbox).to_have_class(re.compile(r'is-zoomed'))

    # First Escape resets zoom back to 1.0x without closing lightbox
    await page.keyboard.press('Escape')
    await expect(lightbox).not_to_have_class(re.compile(r'is-zoomed'))
    await expect(lightbox).to_have_class(re.compile(r'active'))

    # Second Escape at 1.0x closes the lightbox
    await page.keyboard.press('Escape')
    await expect(lightbox).not_to_have_class(re.compile(r'active'))


@pytest.mark.asyncio
async def test_lightbox_mouse_wheel_zoom(page: Page) -> None:
    """Verify mouse wheel zooming on desktop in photo lightbox."""

    async def handle_replay_route(route):
        await route.fulfill(
            status=200,
            content_type='application/json',
            body=json.dumps(MOCK_REPLAY_DATA),
        )

    async def handle_media_route(route):
        await route.fulfill(
            status=200,
            content_type='image/png',
            body=DUMMY_PNG,
        )

    await page.route('**/api/match/test-zoom-match/replay', handle_replay_route)
    await page.route('**/api/media/**', handle_media_route)
    await page.goto('/game/test-zoom-match/replay')

    photo_img = page.locator('#replay-photo-img')
    await photo_img.click()

    lightbox = page.locator('#photo-lightbox')
    lightbox_img = page.locator('#photo-lightbox-img')
    reset_btn = page.locator('.photo-lightbox-zoom-reset')

    # Mouse wheel up (zoom in)
    box = await lightbox_img.bounding_box()
    assert box is not None
    await page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    await page.mouse.wheel(0, -100)

    # Should be zoomed in now
    await expect(lightbox).to_have_class(re.compile(r'is-zoomed'))
    await expect(reset_btn).not_to_have_class(re.compile(r'hidden'))

    # Close lightbox
    await page.locator('.photo-lightbox-close').click()
    await expect(lightbox).not_to_have_class(re.compile(r'active'))
