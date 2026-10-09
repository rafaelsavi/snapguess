"""Playwright E2E tests for Role-Based Access Control (Guest, User, Creator) and Home Card."""

from __future__ import annotations

import re

from playwright.async_api import Page, expect


async def test_auth_creator_default_view(page: Page) -> None:
    """Verify that by default (Creator role), Game Setup is visible and Home Card is hidden."""
    await page.goto('/')
    await page.wait_for_selector('#setup-card')

    setup_card = page.locator('#setup-card')
    home_card = page.locator('#home-card')
    leaderboard_card = page.locator('#leaderboard-card')
    await expect(setup_card).to_be_visible()
    await expect(home_card).to_be_hidden()
    await expect(leaderboard_card).to_be_visible()

    # Nav buttons should all be visible
    await expect(page.locator('#home-nav-btn')).to_be_visible()
    await expect(page.locator('#challenges-nav-btn')).to_be_visible()
    await expect(page.locator('#stats-nav-btn')).to_be_visible()
    await expect(page.locator('#replays-nav-btn')).to_be_visible()


async def test_auth_guest_restrictions_and_home_card(page: Page) -> None:
    """Verify Guest role hides restricted nav items, displays Home Card, and blocks guarded routes."""
    # Mock /api/auth/me to return Guest
    await page.route(
        '**/api/auth/me',
        lambda route: route.fulfill(
            status=200,
            json={'role': 'guest', 'email': None, 'name': None, 'authenticated': False},
        ),
    )

    await page.goto('/')
    await page.wait_for_selector('#home-card')

    # Home card is visible, Setup card and Leaderboard card are hidden
    home_card = page.locator('#home-card')
    setup_card = page.locator('#setup-card')
    leaderboard_card = page.locator('#leaderboard-card')
    await expect(home_card).to_be_visible()
    await expect(setup_card).to_be_hidden()
    await expect(leaderboard_card).to_be_hidden()

    # Restricted nav buttons are hidden for guests
    await expect(page.locator('#challenges-nav-btn')).to_have_class(re.compile(r'\bhidden\b'))
    await expect(page.locator('#stats-nav-btn')).to_have_class(re.compile(r'\bhidden\b'))
    await expect(page.locator('#replays-nav-btn')).to_have_class(re.compile(r'\bhidden\b'))

    # Identity badge should be hidden for unauthenticated guests
    await expect(page.locator('#identity-badge')).to_have_class(re.compile(r'\bhidden\b'))

    # Test joining a challenge via challenge code input
    code_input = page.locator('#home-challenge-code-input')
    join_btn = page.locator('#home-join-btn')
    await expect(code_input).to_be_visible()
    await expect(join_btn).to_be_visible()

    # Empty submit shows error
    await join_btn.click()
    error_el = page.locator('#home-join-error')
    await expect(error_el).to_be_visible()

    # Enter code and join
    await code_input.fill('ABC123XYZ')
    await join_btn.click()
    await page.wait_for_url('**/play/ABC123XYZ')


async def test_auth_guest_guarded_route_redirect(page: Page) -> None:
    """Verify that a Guest navigating directly to /players is blocked and redirected to /."""
    await page.route(
        '**/api/auth/me',
        lambda route: route.fulfill(
            status=200,
            json={'role': 'guest', 'email': None, 'name': None, 'authenticated': False},
        ),
    )

    await page.goto('/players')
    # Should redirect back to / and show Home card
    await page.wait_for_url('**/')
    await expect(page.locator('#home-card')).to_be_visible()
    # Toast notification appears
    toast = page.locator('.share-toast')
    await expect(toast).to_be_visible()


async def test_auth_user_permissions_and_identity_badge(page: Page) -> None:
    """Verify User role shows identity badge, nav buttons, quick links, and allows accessing /players."""
    await page.route(
        '**/api/auth/me',
        lambda route: route.fulfill(
            status=200,
            json={'role': 'user', 'email': 'alice@example.com', 'name': 'Alice', 'authenticated': True},
        ),
    )

    await page.goto('/')
    await page.wait_for_selector('#home-card')

    # Setup card and Leaderboard card are hidden for regular users, Home card is visible
    await expect(page.locator('#setup-card')).to_be_hidden()
    await expect(page.locator('#leaderboard-card')).to_be_hidden()
    await expect(page.locator('#home-card')).to_be_visible()

    # Identity badge shows player label
    badge = page.locator('#identity-badge')
    await expect(badge).to_be_visible()
    await expect(badge).to_contain_text('Alice')
    await expect(badge).to_contain_text('Player')

    # Nav buttons are visible for users
    await expect(page.locator('#challenges-nav-btn')).not_to_have_class(re.compile(r'\bhidden\b'))
    await expect(page.locator('#stats-nav-btn')).not_to_have_class(re.compile(r'\bhidden\b'))
    await expect(page.locator('#replays-nav-btn')).not_to_have_class(re.compile(r'\bhidden\b'))

    # Quick links are visible on Home Card
    quick_links = page.locator('#home-quick-links')
    await expect(quick_links).to_be_visible()

    # Click Quick link to Players
    await page.locator('#home-quick-players').click()
    await page.wait_for_url('**/players')
    await expect(page.locator('#stats-page-card')).to_be_visible()


async def test_header_brand_title_nowrap_across_resolutions(page: Page) -> None:
    """Verify that the brand title 'SnapGuess' never breaks into multiple lines across
    mobile, tablet, and desktop viewports, even when an identity badge with a long name
    is present, and verify that identity-badge dynamically expands while nav and settings
    are never squished or clipped.
    """
    await page.route(
        '**/api/auth/me',
        lambda route: route.fulfill(
            status=200,
            json={
                'role': 'creator',
                'email': 'verylonghostname@example.com',
                'name': 'Hostffffffffffffffffffffffffffffff',
                'authenticated': True,
            },
        ),
    )
    prev_badge_width = 0.0
    for width in [360, 390, 768, 850, 1024, 1280]:
        await page.set_viewport_size({'width': width, 'height': 800})
        await page.goto('/')
        h1 = page.locator('.header-main h1')
        badge = page.locator('#identity-badge')
        nav = page.locator('.header-nav-bar')
        settings_btn = page.locator('#settings-dropdown')

        await expect(h1).to_be_visible()
        await expect(badge).to_be_visible()
        await expect(nav).to_be_visible()
        await expect(settings_btn).to_be_visible()

        text = await h1.inner_text()
        assert text.startswith('SnapGuess')

        h1_box = await h1.bounding_box()
        badge_box = await badge.bounding_box()
        nav_box = await nav.bounding_box()
        settings_box = await settings_btn.bounding_box()

        assert h1_box is not None
        assert badge_box is not None
        assert nav_box is not None
        assert settings_box is not None

        # Verify nav and settings maintain unbothered touch targets
        assert settings_box['width'] >= 38.0
        assert nav_box['width'] >= 180.0

        metrics = await page.evaluate(
            """() => {
                const el = document.querySelector('.header-main h1');
                const style = window.getComputedStyle(el);
                return {
                    clientHeight: el.clientHeight,
                    fontSize: parseFloat(style.fontSize),
                    whiteSpace: style.whiteSpace,
                    scrollWidth: document.documentElement.scrollWidth,
                    clientWidth: document.documentElement.clientWidth
                };
            }"""
        )
        assert metrics['whiteSpace'] == 'nowrap'
        assert metrics['clientHeight'] <= metrics['fontSize'] * 1.8
        assert metrics['scrollWidth'] == metrics['clientWidth']

        # Verify font size remains strictly constant across all desktop viewports (> 760px)
        if width >= 768:
            assert metrics['fontSize'] == 36.0

        # Verify badge dynamically expands as desktop viewport widens
        if width in [768, 850, 1024]:
            assert badge_box['width'] >= prev_badge_width
        prev_badge_width = badge_box['width']
