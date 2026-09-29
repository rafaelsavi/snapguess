"""End-to-End tests verifying photo caption chip sizing and responsive 2-row folding:
- Location chip hugs content snugly (flex: 0 1 auto, width: fit-content) without over-stretching
- No infinite loop / layout oscillation when toggling folding states
- Two-row folding triggers cleanly when combined date + location cannot fit in a single row
"""

from __future__ import annotations

import json

import pytest
from playwright.async_api import Page, expect

MOCK_REPLAY_SNUG = {
    'match_id': 'test-snug-match',
    'game_mode': 'pinpoint',
    'play_mode': 'local',
    'rounds': 1,
    'played_at': 1740000000.0,
    'location_mode': True,
    'date_mode': True,
    'config': {
        'round_count': 1,
        'round_length': '1m',
        'location_mode': True,
        'date_mode': True,
        'game_mode': 'pinpoint',
        'libraries': ['Test'],
    },
    'rounds_data': [
        {
            'round_number': 1,
            'asset_id': 'asset-1',
            'actual_latitude': -28.598,
            'actual_longitude': -49.424,
            'actual_city': 'Siderópolis',
            'actual_country': 'Brazil',
            'actual_date': '1972-03-01T12:00:00.000Z',
            'player_guesses': [
                {
                    'player_name': 'Alice',
                    'player_color': '#3b82f6',
                    'guess_latitude': -28.6,
                    'guess_longitude': -49.4,
                    'distance_km': 1.0,
                    'round_score': 4900,
                    'cumulative_score': 4900,
                    'time_taken_seconds': 10,
                }
            ],
        }
    ],
}

MOCK_REPLAY_LONG_LOC = {
    'match_id': 'test-long-loc-match',
    'game_mode': 'pinpoint',
    'play_mode': 'local',
    'rounds': 1,
    'played_at': 1740000000.0,
    'location_mode': True,
    'date_mode': True,
    'config': {
        'round_count': 1,
        'round_length': '1m',
        'location_mode': True,
        'date_mode': True,
        'game_mode': 'pinpoint',
        'libraries': ['Test'],
    },
    'rounds_data': [
        {
            'round_number': 1,
            'asset_id': 'asset-long-1',
            'actual_latitude': -28.598,
            'actual_longitude': -49.424,
            'actual_city': 'Siderópolis, Santa Catarina, Região Sul',
            'actual_country': 'República Federativa do Brasil',
            'actual_date': '1972-03-01T12:00:00.000Z',
            'player_guesses': [
                {
                    'player_name': 'Alice',
                    'player_color': '#3b82f6',
                    'guess_latitude': -28.6,
                    'guess_longitude': -49.4,
                    'distance_km': 1.0,
                    'round_score': 4900,
                    'cumulative_score': 4900,
                    'time_taken_seconds': 10,
                }
            ],
        }
    ],
}


@pytest.mark.asyncio
async def test_caption_chips_snug_and_no_infinite_loop_on_desktop(page: Page) -> None:
    """Verify that on desktop viewports, the location chip is snug (not stretched across the card)
    and does not oscillate / flap between 1 and 2 lines.
    """
    await page.set_viewport_size({'width': 1200, 'height': 800})

    async def handle_snug(route):
        await route.fulfill(
            status=200,
            content_type='application/json',
            body=json.dumps(MOCK_REPLAY_SNUG),
        )

    await page.route('**/api/match/test-snug-match/replay', handle_snug)
    await page.goto('/game/test-snug-match/replay')
    row_loc = page.locator('#replay-photo-card .reveal-actual-row')
    await expect(row_loc).to_be_visible()

    # 1. Verify no flapping over 600ms
    flaps = 0
    current_state = await row_loc.evaluate('el => el.classList.contains("folded-two-rows")')
    for _ in range(6):
        await page.wait_for_timeout(100)
        new_state = await row_loc.evaluate('el => el.classList.contains("folded-two-rows")')
        if new_state != current_state:
            flaps += 1
            current_state = new_state

    assert flaps == 0, 'Caption row must NOT oscillate between 1 and 2 rows'
    assert not current_state, 'Caption should stay in single-line mode on desktop'

    # 2. Verify snug location chip width (not stretched across empty space)
    row_w = await row_loc.evaluate('el => el.clientWidth')
    loc_w = await page.locator('#replay-photo-card .reveal-chip-location').evaluate('el => el.offsetWidth')
    date_w = await page.locator('#replay-photo-card .reveal-chip-date').evaluate('el => el.offsetWidth')

    assert row_w > 400, f'Expected desktop row width > 400px, got {row_w}px'
    # Location chip with "Siderópolis, Brazil" should be ~130-180px, NOT stretched to fill 300+ px!
    assert loc_w < 220, f'Expected snug location chip width < 220px, got {loc_w}px (row: {row_w}px)'
    assert loc_w + date_w < row_w - 50, 'Chips should hug content, leaving space before the report button'


@pytest.mark.asyncio
async def test_caption_two_row_folding_on_mobile_with_long_location(page: Page) -> None:
    """Verify that when location text is long on a mobile viewport, caption folds cleanly into 2 rows."""
    await page.set_viewport_size({'width': 375, 'height': 667})

    async def handle_long(route):
        await route.fulfill(
            status=200,
            content_type='application/json',
            body=json.dumps(MOCK_REPLAY_LONG_LOC),
        )

    await page.route('**/api/match/test-long-loc-match/replay', handle_long)
    await page.goto('/game/test-long-loc-match/replay')
    row_loc = page.locator('#replay-photo-card .reveal-actual-row')
    await expect(row_loc).to_be_visible()

    # Verify folded-two-rows class is applied
    is_folded = await row_loc.evaluate('el => el.classList.contains("folded-two-rows")')
    assert is_folded, 'Expected caption to fold into 2 rows for long location on mobile'

    # Verify grid row layout: date and report button in row 1, location in row 2
    date_top = await page.locator('#replay-photo-card .reveal-chip-date').evaluate(
        'el => el.getBoundingClientRect().top'
    )
    btn_top = await page.locator('#replay-photo-card .round-photo-report-btn').evaluate(
        'el => el.getBoundingClientRect().top'
    )
    loc_top = await page.locator('#replay-photo-card .reveal-chip-location').evaluate(
        'el => el.getBoundingClientRect().top'
    )

    # Date and button should be vertically aligned in row 1
    assert abs(date_top - btn_top) < 6, f'Date ({date_top}) and report btn ({btn_top}) should be in row 1'
    # Location chip should be positioned below in row 2
    assert loc_top > date_top + 15, f'Location ({loc_top}) should be below date ({date_top}) in row 2'
