"""Playwright E2E tests verifying Unshuffle Date-Only mode:
- Responsive layouts across mobile, foldable portrait (Z Fold 7), foldable landscape, and desktop
- Single row horizontal view (>=1024px) vs single column vertical view (<1024px)
- Arrow buttons and timeline headers dynamic orientation adaptation (▲/▼ ↔ ◀/▶, ⬆️/⬇️ ↔ ⬅️/➡️)
- Drag and drop reordering (HTML5 mouse DnD and Touch DnD)
- Dark and Light theme styling
- Real-time language switching (en-US ↔ pt-BR)
"""

from __future__ import annotations

import re

from playwright.async_api import Page, expect


async def _start_date_only_unshuffle(page: Page) -> None:
    """Navigate to home, select Unshuffle mode with Date-only, and launch match."""
    await page.goto('/')
    await page.wait_for_selector('#setup-card')

    # Select Unshuffle mode
    await page.locator('#mode-unshuffle-btn').click()
    await expect(page.locator('#mode-unshuffle-btn')).to_have_class(re.compile(r'active'))

    # Ensure Location is OFF and Date is ON
    loc_card = page.locator('#card-goal-location')
    date_card = page.locator('#card-goal-date')

    if 'active' in (await loc_card.get_attribute('class') or ''):
        await loc_card.click()
    if 'active' not in (await date_card.get_attribute('class') or ''):
        await date_card.click()

    # Launch match
    await page.locator('#prepare-game-btn').click()
    await page.locator('#start-match-btn').click()

    # Ready button if overlay present
    if await page.locator('#pass-overlay').is_visible():
        await page.locator('#ready-btn').click()
        await expect(page.locator('#pass-overlay')).to_be_hidden()

    # Verify board is loaded and in no-map mode
    cards_list = page.locator('#shuffle-cards-list')
    await expect(cards_list).to_be_visible()
    await expect(cards_list).to_have_class(re.compile(r'no-map'))
    await expect(page.locator('#shuffle-cards-list .shuffle-card-row')).to_have_count(3)


async def test_unshuffle_responsive_layouts_and_orientation_swap(page: Page) -> None:
    """Verify responsive layouts across mobile, Z Fold 7 portrait, Z Fold 7 landscape, and desktop."""
    await page.set_viewport_size({'width': 1280, 'height': 800})
    await _start_date_only_unshuffle(page)

    cards_list = page.locator('#shuffle-cards-list')
    cards = page.locator('#shuffle-cards-list .shuffle-card-row')
    oldest_header = page.locator('.shuffle-timeline-header.oldest')
    newest_footer = page.locator('.shuffle-timeline-header.newest')

    # -------------------------------------------------------------------------
    # 1. Desktop / Landscape Wide View (1280 x 800 >= 1024px)
    # -------------------------------------------------------------------------
    disp = await cards_list.evaluate('el => getComputedStyle(el).display')
    assert disp == 'grid', f'Expected display: grid on wide screen, got {disp}'

    # Header and footer have horizontal emojis
    await expect(oldest_header).to_contain_text('⬅️')
    await expect(newest_footer).to_contain_text('➡️')

    # Buttons must be ◀ and ▶ and stacked horizontally
    first_card = cards.nth(0)
    await expect(first_card.locator('button.shuffle-rank-btn').first).to_have_text('◀')
    await expect(first_card.locator('button.shuffle-rank-btn').last).to_have_text('▶')
    btn0_x = await first_card.locator('button.shuffle-rank-btn').first.evaluate('el => el.getBoundingClientRect().left')
    btn1_x = await first_card.locator('button.shuffle-rank-btn').last.evaluate('el => el.getBoundingClientRect().left')
    assert btn1_x > btn0_x, 'Rank buttons should be stacked horizontally in horizontal mode'

    # Sorting buttons do not change size regardless of horizontal or vertical stacking
    btn0_w = await first_card.locator('button.shuffle-rank-btn').first.evaluate(
        'el => el.getBoundingClientRect().width'
    )
    btn0_h = await first_card.locator('button.shuffle-rank-btn').first.evaluate(
        'el => el.getBoundingClientRect().height'
    )
    assert abs(btn0_w - 38) < 1.0, f'Expected 38px width for horizontal rank button, got {btn0_w}'
    assert abs(btn0_h - 38) < 1.0, f'Expected 38px height for horizontal rank button, got {btn0_h}'

    # Use all available horizontal space on wide screen
    host_w = await page.locator('#mode-active-host').evaluate('el => el.getBoundingClientRect().width')
    list_w = await cards_list.evaluate('el => el.getBoundingClientRect().width')
    assert list_w >= host_w - 2, f'Cards list must use all available horizontal space ({list_w}px >= {host_w}px)'

    # Cards must be arranged horizontally: card 1 offsetLeft > card 0 offsetLeft
    card0_x = await cards.nth(0).evaluate('el => el.getBoundingClientRect().left')
    card1_x = await cards.nth(1).evaluate('el => el.getBoundingClientRect().left')
    assert card1_x > card0_x, 'Cards should be arranged horizontally side-by-side'

    # Cards must be prominent and wide (not tiny squished cards)
    card0_w = await cards.nth(0).evaluate('el => el.getBoundingClientRect().width')
    assert card0_w >= 240, f'Cards must be prominent and wide on desktop (>=240px), got {card0_w}px'

    # Card internal layout is column (photo on top, controls below)
    card_flex_dir = await first_card.evaluate('el => getComputedStyle(el).flexDirection')
    assert card_flex_dir == 'column', f'Expected card flex-direction: column in horizontal layout, got {card_flex_dir}'

    # No horizontal scroll blowout
    overflow = await page.evaluate('() => document.documentElement.scrollWidth > document.documentElement.clientWidth')
    assert not overflow, 'Viewport should have no horizontal overflow on desktop'

    # -------------------------------------------------------------------------
    # 2. Samsung Galaxy Z Fold 7 Landscape (1092 x 984 >= 1024px)
    # -------------------------------------------------------------------------
    await page.set_viewport_size({'width': 1092, 'height': 984})
    await page.wait_for_timeout(100)

    disp_fold_land = await cards_list.evaluate('el => getComputedStyle(el).display')
    assert disp_fold_land == 'grid', 'Z Fold 7 landscape must be in single row horizontal mode'
    await expect(oldest_header).to_contain_text('⬅️')
    await expect(first_card.locator('button.shuffle-rank-btn').first).to_have_text('◀')

    overflow = await page.evaluate('() => document.documentElement.scrollWidth > document.documentElement.clientWidth')
    assert not overflow, 'Viewport should have no horizontal overflow on Z Fold 7 landscape'

    # -------------------------------------------------------------------------
    # 3. Samsung Galaxy Z Fold 7 Portrait (984 x 1092 < 1024px)
    # -------------------------------------------------------------------------
    await page.set_viewport_size({'width': 984, 'height': 1092})
    await page.wait_for_timeout(100)

    # Must dynamically switch to vertical column!
    disp_fold_port = await cards_list.evaluate('el => getComputedStyle(el).display')
    assert disp_fold_port == 'flex', f'Z Fold 7 portrait must be in flex mode, got {disp_fold_port}'
    flex_dir_fold_port = await cards_list.evaluate('el => getComputedStyle(el).flexDirection')
    assert flex_dir_fold_port == 'column', (
        f'Z Fold 7 portrait must be in vertical column mode, got {flex_dir_fold_port}'
    )

    # Header and footer have vertical emojis
    await expect(oldest_header).to_contain_text('⬆️')
    await expect(newest_footer).to_contain_text('⬇️')

    # Buttons must dynamically switch to ▲ and ▼, stacked vertically to save space
    await expect(first_card.locator('button.shuffle-rank-btn').first).to_have_text('▲')
    await expect(first_card.locator('button.shuffle-rank-btn').last).to_have_text('▼')
    btn_up_y = await first_card.locator('button.shuffle-rank-btn').first.evaluate(
        'el => el.getBoundingClientRect().top'
    )
    btn_down_y = await first_card.locator('button.shuffle-rank-btn').last.evaluate(
        'el => el.getBoundingClientRect().top'
    )
    assert btn_down_y > btn_up_y, 'Rank buttons should be stacked vertically (▲ above ▼) in vertical mode'

    btn_up_w = await first_card.locator('button.shuffle-rank-btn').first.evaluate(
        'el => el.getBoundingClientRect().width'
    )
    btn_up_h = await first_card.locator('button.shuffle-rank-btn').first.evaluate(
        'el => el.getBoundingClientRect().height'
    )
    assert abs(btn_up_w - 38) < 1.0, f'Expected 38px width for vertical rank button, got {btn_up_w}'
    assert abs(btn_up_h - 38) < 1.0, f'Expected 38px height for vertical rank button, got {btn_up_h}'

    # Cards must be arranged vertically: card 1 top > card 0 top
    card0_y = await cards.nth(0).evaluate('el => el.getBoundingClientRect().top')
    card1_y = await cards.nth(1).evaluate('el => el.getBoundingClientRect().top')
    assert card1_y > card0_y, 'Cards should be arranged vertically stacked'

    # Max-width on medium screen allows wider cards up to 680px
    max_w = await cards_list.evaluate('el => parseFloat(getComputedStyle(el).maxWidth)')
    assert max_w >= 650, f'Expected wider card column on Z Fold 7 portrait, got {max_w}px'

    overflow = await page.evaluate('() => document.documentElement.scrollWidth > document.documentElement.clientWidth')
    assert not overflow, 'Viewport should have no horizontal overflow on Z Fold 7 portrait'

    # -------------------------------------------------------------------------
    # 4. Standard Mobile Phone (360 x 800)
    # -------------------------------------------------------------------------
    await page.set_viewport_size({'width': 360, 'height': 800})
    await page.wait_for_timeout(100)

    disp_mobile = await cards_list.evaluate('el => getComputedStyle(el).display')
    assert disp_mobile == 'flex', 'Mobile screen must be in flex mode'
    flex_dir_mobile = await cards_list.evaluate('el => getComputedStyle(el).flexDirection')
    assert flex_dir_mobile == 'column', 'Mobile screen must be in vertical column mode'
    await expect(oldest_header).to_contain_text('⬆️')
    await expect(first_card.locator('button.shuffle-rank-btn').first).to_have_text('▲')

    # Sorting buttons stacked vertically on mobile
    btn_mob_up_y = await first_card.locator('button.shuffle-rank-btn').first.evaluate(
        'el => el.getBoundingClientRect().top'
    )
    btn_mob_down_y = await first_card.locator('button.shuffle-rank-btn').last.evaluate(
        'el => el.getBoundingClientRect().top'
    )
    assert btn_mob_down_y > btn_mob_up_y, 'Rank buttons must be stacked vertically on mobile'

    overflow = await page.evaluate('() => document.documentElement.scrollWidth > document.documentElement.clientWidth')
    assert not overflow, 'Viewport should have no horizontal overflow on 360px mobile'


async def test_unshuffle_mouse_and_touch_drag_and_drop(page: Page) -> None:
    """Verify HTML5 mouse drag-and-drop and touch drag-and-drop reordering with live announcements."""
    await page.set_viewport_size({'width': 1200, 'height': 850})
    await _start_date_only_unshuffle(page)

    cards = page.locator('#shuffle-cards-list .shuffle-card-row')
    img0 = await cards.nth(0).locator('img').get_attribute('src')
    img1 = await cards.nth(1).locator('img').get_attribute('src')
    img2 = await cards.nth(2).locator('img').get_attribute('src')

    # All cards have draggable attribute and sortable item role
    for i in range(3):
        card = cards.nth(i)
        await expect(card).to_have_attribute('draggable', 'true')
        await expect(card).to_have_attribute('aria-roledescription', 'sortable item')
        await expect(card).to_have_attribute('role', 'listitem')

    # -------------------------------------------------------------------------
    # 1. HTML5 Drag-and-Drop: Drag Card 0 to Card 2
    # -------------------------------------------------------------------------
    # Use HTML5 DragEvent dispatch to simulate drag & drop cleanly
    await page.evaluate("""() => {
        const cards = document.querySelectorAll('#shuffle-cards-list .shuffle-card-row');
        const srcCard = cards[0];
        const tgtCard = cards[2];
        const tgtRect = tgtCard.getBoundingClientRect();

        const dt = new DataTransfer();
        srcCard.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));

        // Dragover the second half of target card (after midpoint)
        tgtCard.dispatchEvent(new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            clientX: tgtRect.left + tgtRect.width * 0.75,
            clientY: tgtRect.top + tgtRect.height * 0.5,
            dataTransfer: dt
        }));

        tgtCard.dispatchEvent(new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            clientX: tgtRect.left + tgtRect.width * 0.75,
            clientY: tgtRect.top + tgtRect.height * 0.5,
            dataTransfer: dt
        }));

        srcCard.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }""")

    await page.wait_for_timeout(100)

    # Reordered order should now be: [img1, img2, img0]
    reordered_cards = page.locator('#shuffle-cards-list .shuffle-card-row')
    await expect(reordered_cards.nth(0).locator('img')).to_have_attribute('src', img1 or '')
    await expect(reordered_cards.nth(1).locator('img')).to_have_attribute('src', img2 or '')
    await expect(reordered_cards.nth(2).locator('img')).to_have_attribute('src', img0 or '')

    # Aria-live polite region must announce movement
    live_text = await page.locator('#shuffle-live').text_content()
    assert live_text and '3' in live_text, f"Live region should announce moved position, got '{live_text}'"

    # -------------------------------------------------------------------------
    # 2. Touch Drag-and-Drop on Mobile: Touch drag card 0 down to card 1
    # -------------------------------------------------------------------------
    await page.set_viewport_size({'width': 390, 'height': 844})
    await page.wait_for_timeout(100)

    # Current order is [img1, img2, img0]
    # We will touch-drag item 0 (img1) down onto item 1 (img2)
    cur_cards = page.locator('#shuffle-cards-list .shuffle-card-row')
    c0_box = await cur_cards.nth(0).bounding_box()
    c1_box = await cur_cards.nth(1).bounding_box()
    assert c0_box is not None and c1_box is not None

    start_x = c0_box['x'] + c0_box['width'] / 2
    start_y = c0_box['y'] + c0_box['height'] / 2
    dest_x = c1_box['x'] + c1_box['width'] / 2
    dest_y = c1_box['y'] + c1_box['height'] * 0.75

    # Simulate touch sequence with 300ms hold to exceed 250ms hold delay
    await page.evaluate(
        """({ startX, startY }) => {
        const cards = document.querySelectorAll('#shuffle-cards-list .shuffle-card-row');
        const c0 = cards[0];

        const touch1 = new Touch({ identifier: 1, target: c0, clientX: startX, clientY: startY });
        c0.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch1] }));
    }""",
        {'startX': start_x, 'startY': start_y},
    )

    # Wait 300ms for hold timer to trigger drag activation and ghost creation
    await page.wait_for_timeout(300)

    # Ghost element must be attached to body
    ghost = page.locator('.drag-ghost')
    await expect(ghost).to_be_visible()

    # Move to destination
    await page.evaluate(
        """({ destX, destY }) => {
        const touch2 = new Touch({ identifier: 1, target: document.body, clientX: destX, clientY: destY });
        window.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch2] }));
    }""",
        {'destX': dest_x, 'destY': dest_y},
    )

    await page.wait_for_timeout(50)

    # Release touch
    await page.evaluate("""() => {
        window.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }));
    }""")

    await page.wait_for_timeout(100)

    # Ghost should be cleaned up
    await expect(page.locator('.drag-ghost')).to_have_count(0)

    # Cards reordered: item 0 was moved after item 1 -> order now [img2, img1, img0]
    touch_cards = page.locator('#shuffle-cards-list .shuffle-card-row')
    await expect(touch_cards.nth(0).locator('img')).to_have_attribute('src', img2 or '')
    await expect(touch_cards.nth(1).locator('img')).to_have_attribute('src', img1 or '')
    await expect(touch_cards.nth(2).locator('img')).to_have_attribute('src', img0 or '')


async def test_unshuffle_themes_and_language_switching(page: Page) -> None:
    """Verify light/dark mode styles and real-time English/Portuguese translation switching."""
    await page.set_viewport_size({'width': 1200, 'height': 800})
    await _start_date_only_unshuffle(page)

    cards = page.locator('#shuffle-cards-list .shuffle-card-row')
    oldest_header = page.locator('.shuffle-timeline-header.oldest')
    newest_footer = page.locator('.shuffle-timeline-header.newest')

    # -------------------------------------------------------------------------
    # 1. English Verifications in Horizontal Layout
    # -------------------------------------------------------------------------
    await expect(oldest_header).to_contain_text('First')
    await expect(newest_footer).to_contain_text('Last')

    btn_prev = cards.nth(1).locator('button.shuffle-rank-btn').first
    btn_next = cards.nth(1).locator('button.shuffle-rank-btn').last
    await expect(btn_prev).to_have_attribute('title', 'Move Left (Earlier)')
    await expect(btn_next).to_have_attribute('title', 'Move Right (Later)')

    # Verify drag-and-drop instructions in English Help modal
    await page.locator('.shuffle-help-btn').first.click()
    await expect(page.locator('#unshuffle-help-modal')).to_be_visible()
    await expect(page.locator('#unshuffle-help-modal .shuffle-help-body')).to_contain_text(
        'Drag and drop cards directly'
    )
    await page.locator('#shuffle-help-close-btn').click()
    await expect(page.locator('#unshuffle-help-modal')).to_be_hidden()

    # -------------------------------------------------------------------------
    # 2. Dark Mode Styling Verification
    # -------------------------------------------------------------------------
    # Toggle theme via settings menu
    await page.locator('#settings-toggle-btn').click()
    await expect(page.locator('#settings-menu')).to_be_visible()
    await page.locator('#theme-toggle-btn').click()
    await expect(page.locator('html')).to_have_attribute('data-theme', 'dark')

    # Verify dark background color on card (with auto-retry for CSS transition)
    await expect(cards.nth(0)).to_have_css('background-color', 'rgb(19, 27, 46)')

    # Close settings menu
    await page.locator('#settings-toggle-btn').click()

    # -------------------------------------------------------------------------
    # 3. Dynamic Portuguese Language Switching
    # -------------------------------------------------------------------------
    await page.evaluate("() => document.getElementById('lang-toggle-btn')?.click()")
    await page.wait_for_timeout(200)

    # In Horizontal mode with Portuguese:
    await expect(oldest_header).to_contain_text('Primeira')
    await expect(newest_footer).to_contain_text('Última')
    await expect(btn_prev).to_have_attribute('title', 'Mover para Esquerda (Mais Antiga)')
    await expect(btn_next).to_have_attribute('title', 'Mover para Direita (Mais Recente)')

    # Verify drag-and-drop instructions in Portuguese Help modal
    await page.locator('.shuffle-help-btn').first.click()
    await expect(page.locator('#unshuffle-help-modal')).to_be_visible()
    await expect(page.locator('#unshuffle-help-modal .shuffle-help-body')).to_contain_text('Arraste e solte os cards')
    await page.locator('#shuffle-help-close-btn').click()
    await expect(page.locator('#unshuffle-help-modal')).to_be_hidden()

    # Switch to Vertical mode (mobile width 390px):
    await page.set_viewport_size({'width': 390, 'height': 844})
    await page.wait_for_timeout(150)

    # In Vertical mode with Portuguese:
    await expect(oldest_header).to_contain_text('⬆️')
    await expect(oldest_header).to_contain_text('Primeira')
    await expect(newest_footer).to_contain_text('⬇️')
    await expect(newest_footer).to_contain_text('Última')

    btn_vert_up = cards.nth(1).locator('button.shuffle-rank-btn').first
    btn_vert_down = cards.nth(1).locator('button.shuffle-rank-btn').last
    await expect(btn_vert_up).to_have_text('▲')
    await expect(btn_vert_up).to_have_attribute('title', 'Mover para Cima (Mais Antiga)')
    await expect(btn_vert_down).to_have_text('▼')
    await expect(btn_vert_down).to_have_attribute('title', 'Mover para Baixo (Mais Recente)')


async def test_unshuffle_location_mode_vertical_stacking(page: Page) -> None:
    """Verify that in Location+Date mode, pin chips ABC and sorting buttons are both stacked vertically."""
    await page.set_viewport_size({'width': 1280, 'height': 800})
    await page.goto('/')
    await page.wait_for_selector('#setup-card')

    await page.locator('#mode-unshuffle-btn').click()
    loc_card = page.locator('#card-goal-location')
    date_card = page.locator('#card-goal-date')

    if 'active' not in (await loc_card.get_attribute('class') or ''):
        await loc_card.click()
    if 'active' not in (await date_card.get_attribute('class') or ''):
        await date_card.click()

    await page.locator('#prepare-game-btn').click()
    await page.locator('#start-match-btn').click()
    if await page.locator('#pass-overlay').is_visible():
        await page.locator('#ready-btn').click()

    cards = page.locator('#shuffle-cards-list .shuffle-card-row')
    await expect(cards).to_have_count(3)

    first_card = cards.nth(0)
    pin_chips = first_card.locator('.shuffle-pin-chip')
    await expect(pin_chips).to_have_count(3)

    # Pin chips must be stacked vertically (A above B above C)
    pin0_y = await pin_chips.nth(0).evaluate('el => el.getBoundingClientRect().top')
    pin1_y = await pin_chips.nth(1).evaluate('el => el.getBoundingClientRect().top')
    pin2_y = await pin_chips.nth(2).evaluate('el => el.getBoundingClientRect().top')
    assert pin1_y > pin0_y, 'Pin B should be below Pin A (stacked vertically)'
    assert pin2_y > pin1_y, 'Pin C should be below Pin B (stacked vertically)'

    # Sorting buttons must also be stacked vertically (▲ above ▼)
    rank_btns = first_card.locator('button.shuffle-rank-btn')
    await expect(rank_btns).to_have_count(2)
    btn_up_y = await rank_btns.first.evaluate('el => el.getBoundingClientRect().top')
    btn_down_y = await rank_btns.last.evaluate('el => el.getBoundingClientRect().top')
    assert btn_down_y > btn_up_y, 'Down button should be below Up button (stacked vertically)'


async def test_unshuffle_touch_scroll_conflict_prevention(page: Page) -> None:
    """Verify touch swipe/scroll gestures cancel drag initialization to avoid mobile page scroll conflicts."""
    await page.set_viewport_size({'width': 390, 'height': 844})
    await _start_date_only_unshuffle(page)

    cards = page.locator('#shuffle-cards-list .shuffle-card-row')
    c0 = cards.nth(0)
    c0_box = await c0.bounding_box()
    assert c0_box is not None

    start_x = c0_box['x'] + c0_box['width'] / 2
    start_y = c0_box['y'] + c0_box['height'] / 2

    # 1. Vertical scroll/swipe gesture: touch starts and moves 20px vertically within 30ms
    await page.evaluate(
        """({ startX, startY }) => {
        const c0 = document.querySelectorAll('#shuffle-cards-list .shuffle-card-row')[0];
        const t1 = new Touch({ identifier: 10, target: c0, clientX: startX, clientY: startY });
        c0.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t1] }));

        // Immediate scroll motion > 6px threshold
        const t2 = new Touch({ identifier: 10, target: c0, clientX: startX, clientY: startY + 20 });
        window.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t2] }));
    }""",
        {'startX': start_x, 'startY': start_y},
    )

    # Wait past the 250ms hold delay
    await page.wait_for_timeout(320)

    # Verify drag was NOT initiated (no ghost element, no dragging class)
    await expect(page.locator('.drag-ghost')).to_have_count(0)
    has_dragging = await c0.evaluate('el => el.classList.contains("dragging")')
    assert not has_dragging, "Card should not have 'dragging' class after a scroll gesture"

    # Clean up gesture
    await page.evaluate("""() => {
        window.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }));
    }""")
    await page.wait_for_timeout(50)

    # 2. Quick tap gesture: touch starts and ends within 50ms (e.g. tapping to view photo)
    await page.evaluate(
        """({ startX, startY }) => {
        const c0 = document.querySelectorAll('#shuffle-cards-list .shuffle-card-row')[0];
        const t1 = new Touch({ identifier: 11, target: c0, clientX: startX, clientY: startY });
        c0.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t1] }));
    }""",
        {'startX': start_x, 'startY': start_y},
    )
    await page.wait_for_timeout(50)
    await page.evaluate("""() => {
        window.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }));
    }""")
    await page.wait_for_timeout(300)

    # Verify no ghost was created after quick tap
    await expect(page.locator('.drag-ghost')).to_have_count(0)
    has_dragging = await c0.evaluate('el => el.classList.contains("dragging")')
    assert not has_dragging, "Card should not have 'dragging' class after quick tap"

    # 3. Touchcancel gesture: browser claims native scroll and cancels touch
    await page.evaluate(
        """({ startX, startY }) => {
        const c0 = document.querySelectorAll('#shuffle-cards-list .shuffle-card-row')[0];
        const t1 = new Touch({ identifier: 12, target: c0, clientX: startX, clientY: startY });
        c0.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t1] }));
    }""",
        {'startX': start_x, 'startY': start_y},
    )
    await page.wait_for_timeout(40)
    await page.evaluate("""() => {
        window.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true, cancelable: true, touches: [] }));
    }""")
    await page.wait_for_timeout(300)

    # Verify no ghost was created after touchcancel
    await expect(page.locator('.drag-ghost')).to_have_count(0)
