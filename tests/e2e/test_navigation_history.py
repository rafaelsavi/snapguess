"""Playwright E2E tests for general back button strategy and in-app navigation history tracking."""

from __future__ import annotations

from playwright.async_api import Page, expect


async def test_replay_direct_navigation_falls_back_to_replays(page: Page) -> None:
    """When a user lands directly on a match replay from an external link (cold start),
    clicking the back button safely navigates to the Replays Catalog (/replays).
    """

    async def handle_replay_route(route):
        await route.fulfill(
            status=200,
            content_type='application/json',
            json={
                'match_id': 'mock-match-direct',
                'finished_at': '2026-03-01T12:00:00Z',
                'play_mode': 'local',
                'total_rounds': 1,
                'players': [{'player_name': 'Player 1', 'color': '#0f7c7f'}],
                'rounds': [
                    {
                        'round_number': 1,
                        'asset_id': 'asset-1',
                        'correct_lat': 10.0,
                        'correct_lon': 20.0,
                        'player_guesses': [
                            {
                                'player_name': 'Player 1',
                                'guess_lat': 10.1,
                                'guess_lon': 20.1,
                                'distance_km': 15.0,
                                'round_points': 4500,
                                'time_taken_seconds': 5.0,
                            }
                        ],
                    }
                ],
            },
        )

    await page.route('**/api/match/mock-match-direct/replay', handle_replay_route)

    # 1. Direct navigation (cold start)
    await page.goto('/game/mock-match-direct/replay')
    await expect(page.locator('#summary-card')).to_be_visible()
    await expect(page.locator('#review-header-replay')).to_be_visible()

    # 2. Click back button
    back_btn = page.locator('#replay-back-btn')
    await expect(back_btn).to_be_visible()
    await back_btn.click()

    # 3. Should safely fall back to /replays
    await expect(page.locator('#replays-page-card')).to_be_visible()
    assert '/replays' in page.url


async def test_replay_back_from_player_profile_returns_to_profile(page: Page) -> None:
    """When a user navigates to a replay from a player profile,
    clicking the back button returns to the player profile instead of /replays.
    """

    async def handle_profile_route(route):
        await route.fulfill(
            status=200,
            content_type='application/json',
            json={
                'player': {
                    'player_name': 'Alice',
                    'avatar_color': '#ff5722',
                    'first_played_at': '2026-01-01T12:00:00Z',
                    'matches_played': 1,
                    'matches_won': 1,
                    'win_rate_pct': 100.0,
                    'career_points': 5000,
                    'avg_accuracy_pct': 98.5,
                    'peak_match_accuracy_pct': 98.5,
                    'podiums_count': 1,
                },
                'analytics': {
                    'best_distance_km': 1.2,
                    'perfect_location_rounds_count': 1,
                    'avg_location_accuracy_pct': 98.5,
                    'avg_date_accuracy_pct': 95.0,
                    'exact_year_month_pct': 100.0,
                    'exact_year_pct': 100.0,
                    'perfect_date_rounds_count': 1,
                    'avg_response_time_seconds': 4.0,
                    'fastest_response_time_seconds': 4.0,
                    'total_active_time_seconds': 60,
                    'preferred_cadence': 'Casual',
                    'location_tiers': [],
                    'date_tiers': [],
                    'mode_mastery': [],
                },
                'recent_matches': [
                    {
                        'match_id': 'alice-match-1',
                        'game_mode': 'pinpoint',
                        'played_at': '2026-03-01T12:00:00Z',
                        'rank': 1,
                        'total_score': 5000,
                        'accuracy_pct': 98.5,
                        'is_winner': True,
                    }
                ],
            },
        )

    async def handle_replay_route(route):
        await route.fulfill(
            status=200,
            content_type='application/json',
            json={
                'match_id': 'alice-match-1',
                'finished_at': '2026-03-01T12:00:00Z',
                'play_mode': 'local',
                'total_rounds': 1,
                'players': [{'player_name': 'Alice', 'color': '#ff5722'}],
                'rounds': [
                    {
                        'round_number': 1,
                        'asset_id': 'asset-alice',
                        'correct_lat': 48.85,
                        'correct_lon': 2.35,
                        'player_guesses': [
                            {
                                'player_name': 'Alice',
                                'guess_lat': 48.86,
                                'guess_lon': 2.36,
                                'distance_km': 1.2,
                                'round_points': 5000,
                                'time_taken_seconds': 4.0,
                            }
                        ],
                    }
                ],
            },
        )

    await page.route('**/api/players/Alice/profile*', handle_profile_route)
    await page.route('**/api/match/alice-match-1/replay', handle_replay_route)

    # 1. Start at Alice's profile
    await page.goto('/players/Alice')
    await expect(page.locator('#stats-page-card')).to_be_visible()
    await expect(page.locator('.player-hero-name')).to_have_text('Alice')

    # 2. Click "Watch Replay" link in recent matches table
    watch_link = page.locator('a.replay-action-btn').first
    await expect(watch_link).to_be_visible()
    await watch_link.click()

    # 3. Arrive at match replay
    await expect(page.locator('#summary-card')).to_be_visible()
    await expect(page.locator('#review-header-replay')).to_be_visible()
    assert '/game/alice-match-1/replay' in page.url

    # 4. Click back button
    back_btn = page.locator('#replay-back-btn')
    await expect(back_btn).to_be_visible()
    await back_btn.click()

    # 5. Must return to Alice's profile (/players/Alice), NOT /replays
    await expect(page.locator('#stats-page-card')).to_be_visible()
    await expect(page.locator('.player-hero-name')).to_have_text('Alice')
    assert '/players/Alice' in page.url
