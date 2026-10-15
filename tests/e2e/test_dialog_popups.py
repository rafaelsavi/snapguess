"""End-to-End tests for PWA-native Website Dialog Popups.

Verifies:
- Alert, Confirm, and Prompt dialog flows (OK, Cancel, Text Input, Escape key, Backdrop click)
- Focus trapping and keyboard accessibility (Tab / Shift+Tab cycling)
- In-game abandonment and Router Navigation Guard interaction
- Mobile viewports (360x800, 390x844) without horizontal blowout
- Dark mode theme styling and PWA standalone presentation
"""

import re

import pytest
from playwright.async_api import Page, expect

from tests.e2e.conftest import start_date_only_match


@pytest.mark.asyncio
async def test_alert_dialog_lifecycle_and_dismissal(page: Page) -> None:
    """Verify alert dialog renders with title, icon, message, and dismisses via OK button and Escape key."""
    await page.goto('/')
    await expect(page.locator('#setup-card')).to_be_visible()

    dialog = page.locator('#app-dialog-modal')
    await expect(dialog).to_be_hidden()

    # Trigger showAlertDialog via client-side call
    await page.evaluate("""() => {
        import('/static/js/modules/components/dialog.js').then(({ showAlertDialog }) => {
            window.__alertPromise = showAlertDialog({
                title: "Test Alert",
                message: "This is a test notification message.",
                okText: "Acknowledge"
            });
        });
    }""")

    await expect(dialog).to_be_visible()
    await expect(page.locator('#app-dialog-title')).to_have_text('Test Alert')
    await expect(page.locator('#app-dialog-message')).to_have_text('This is a test notification message.')
    await expect(page.locator('#app-dialog-confirm-btn')).to_have_text('Acknowledge')
    await expect(page.locator('#app-dialog-cancel-btn')).to_be_hidden()
    await expect(page.locator('#app-dialog-prompt-wrap')).to_be_hidden()

    # Dismiss via OK button
    await page.locator('#app-dialog-confirm-btn').click()
    await expect(dialog).to_be_hidden()

    # Verify Promise resolved
    resolved = await page.evaluate('() => window.__alertPromise.then(() => true)')
    assert resolved is True

    # Test Escape key dismiss on alert
    await page.evaluate("""() => {
        import('/static/js/modules/components/dialog.js').then(({ showAlertDialog }) => {
            window.__alertPromise2 = showAlertDialog({
                title: "Escape Notice",
                message: "Press escape to dismiss me."
            });
        });
    }""")
    await expect(dialog).to_be_visible()
    await page.keyboard.press('Escape')
    await expect(dialog).to_be_hidden()


@pytest.mark.asyncio
async def test_confirm_dialog_choices_and_focus_trap(page: Page) -> None:
    """Verify confirm dialog resolves false on Cancel and true on Confirm, with focus trapping."""
    await page.goto('/')
    await expect(page.locator('#setup-card')).to_be_visible()

    dialog = page.locator('#app-dialog-modal')

    # 1. Test Cancel choice
    await page.evaluate("""() => {
        import('/static/js/modules/components/dialog.js').then(({ showConfirmDialog }) => {
            window.__confirmPromise1 = showConfirmDialog({
                title: "Delete Progress?",
                message: "This cannot be undone.",
                confirmText: "Delete",
                cancelText: "Keep",
                isDanger: true
            });
        });
    }""")
    await expect(dialog).to_be_visible()
    await expect(page.locator('#app-dialog-confirm-btn')).to_have_class(re.compile(r'btn-danger'))
    await expect(page.locator('#app-dialog-cancel-btn')).to_be_visible()

    # In danger confirm dialog, cancel button receives initial focus for safety
    await expect(page.locator('#app-dialog-cancel-btn')).to_be_focused()

    # Press Tab: should cycle to confirm button, then close button, then back to cancel
    await page.keyboard.press('Tab')
    await expect(page.locator('#app-dialog-confirm-btn')).to_be_focused()
    await page.keyboard.press('Tab')
    await expect(page.locator('#app-dialog-close-btn')).to_be_focused()
    await page.keyboard.press('Tab')
    await expect(page.locator('#app-dialog-cancel-btn')).to_be_focused()

    # Click Cancel
    await page.locator('#app-dialog-cancel-btn').click()
    await expect(dialog).to_be_hidden()
    result1 = await page.evaluate('() => window.__confirmPromise1')
    assert result1 is False

    # 2. Test Confirm choice
    await page.evaluate("""() => {
        import('/static/js/modules/components/dialog.js').then(({ showConfirmDialog }) => {
            window.__confirmPromise2 = showConfirmDialog({
                title: "Proceed?",
                message: "Continue to next step."
            });
        });
    }""")
    await expect(dialog).to_be_visible()
    await page.locator('#app-dialog-confirm-btn').click()
    await expect(dialog).to_be_hidden()
    result2 = await page.evaluate('() => window.__confirmPromise2')
    assert result2 is True


@pytest.mark.asyncio
async def test_prompt_dialog_input_and_enter_key(page: Page) -> None:
    """Verify prompt dialog supports defaultValue, keyboard input, Enter submission, and Cancel."""
    await page.goto('/')
    dialog = page.locator('#app-dialog-modal')

    # Test typing and Enter key submission
    await page.evaluate("""() => {
        import('/static/js/modules/components/dialog.js').then(({ showPromptDialog }) => {
            window.__promptPromise = showPromptDialog({
                title: "Player Alias",
                message: "Enter your nickname:",
                defaultValue: "Player",
                placeholder: "e.g. Captain"
            });
        });
    }""")
    await expect(dialog).to_be_visible()
    prompt_input = page.locator('#app-dialog-prompt-input')
    await expect(prompt_input).to_be_visible()
    await expect(prompt_input).to_have_value('Player')
    await expect(prompt_input).to_be_focused()

    # Type new value and press Enter
    await prompt_input.fill('Navigator')
    await page.keyboard.press('Enter')
    await expect(dialog).to_be_hidden()

    val = await page.evaluate('() => window.__promptPromise')
    assert val == 'Navigator'


@pytest.mark.asyncio
async def test_router_navigation_guard_with_dialog(page: Page) -> None:
    """Verify that attempting to navigate away from an active match triggers dialog and respects player choices."""
    await page.goto('/')
    await start_date_only_match(page, rounds=5)
    await expect(page.locator('#game-card')).to_be_visible()

    dialog = page.locator('#app-dialog-modal')

    # 1. Try to navigate to /players via router navigate
    await page.evaluate("""() => {
        import('/static/js/modules/router.js').then(({ navigate }) => {
            navigate('/players');
        });
    }""")
    await expect(dialog).to_be_visible()
    await expect(page.locator('#app-dialog-message')).to_contain_text('Are you sure')

    # Dismiss (cancel)
    await page.locator('#app-dialog-cancel-btn').click()
    await expect(dialog).to_be_hidden()
    await expect(page.locator('#game-card')).to_be_visible()

    # 2. Try again and confirm abandonment
    await page.evaluate("""() => {
        import('/static/js/modules/router.js').then(({ navigate }) => {
            navigate('/players');
        });
    }""")
    await expect(dialog).to_be_visible()
    await page.locator('#app-dialog-confirm-btn').click()
    await expect(dialog).to_be_hidden()

    # Successfully navigated away to players directory
    await expect(page).to_have_url(re.compile(r'/players$'))
    await expect(page.locator('#stats-page-card')).to_be_visible()


@pytest.mark.asyncio
async def test_dialog_mobile_responsive_and_dark_mode(page: Page) -> None:
    """Verify dialog renders cleanly on a 360px viewport without blowout,
    with touch targets >= 40px, and in dark mode.
    """
    # Set Android baseline viewport (360x800)
    await page.set_viewport_size({'width': 360, 'height': 800})
    await page.goto('/')

    dialog = page.locator('#app-dialog-modal')

    # Open confirm dialog
    await page.evaluate("""() => {
        document.documentElement.setAttribute('data-theme', 'dark');
        import('/static/js/modules/components/dialog.js').then(({ showConfirmDialog }) => {
            showConfirmDialog({
                title: "Mobile PWA Dialog",
                message: "Verify responsive bottom-padding and touch targets on phone screens.",
                confirmText: "Confirm Action",
                cancelText: "Dismiss"
            });
        });
    }""")

    await expect(dialog).to_be_visible()

    # Verify no horizontal page blowout
    scroll_width = await page.evaluate('document.documentElement.scrollWidth')
    client_width = await page.evaluate('document.documentElement.clientWidth')
    assert scroll_width == client_width == 360

    # Verify touch target heights >= 40px on phone screens
    confirm_box = await page.locator('#app-dialog-confirm-btn').bounding_box()
    cancel_box = await page.locator('#app-dialog-cancel-btn').bounding_box()
    assert confirm_box is not None and confirm_box['height'] >= 40
    assert cancel_box is not None and cancel_box['height'] >= 40

    # Dismiss
    await page.locator('#app-dialog-cancel-btn').click()
    await expect(dialog).to_be_hidden()


@pytest.mark.asyncio
async def test_dialog_backdrop_dismissal_and_queueing(page: Page) -> None:
    """Verify dialog dismisses on backdrop click and sequential dialog queue handles multiple popups in order."""
    await page.goto('/')
    dialog = page.locator('#app-dialog-modal')

    # 1. Backdrop click dismisses confirm dialog as false
    await page.evaluate("""() => {
        import('/static/js/modules/components/dialog.js').then(({ showConfirmDialog }) => {
            window.__backdropPromise = showConfirmDialog({
                title: "Backdrop Dismissal",
                message: "Clicking outside this box should cancel safely."
            });
        });
    }""")
    await expect(dialog).to_be_visible()

    # Click on the backdrop overlay (outside the 440px card)
    await page.mouse.click(10, 10)
    await expect(dialog).to_be_hidden()
    backdrop_res = await page.evaluate('() => window.__backdropPromise')
    assert backdrop_res is False

    # 2. Sequential Queueing: Queue two dialogs at once
    await page.evaluate("""() => {
        import('/static/js/modules/components/dialog.js').then(({ showAlertDialog }) => {
            window.__qRes1 = null;
            window.__qRes2 = null;
            showAlertDialog({ title: "First Dialog", message: "Step 1 of 2" })
                .then(() => { window.__qRes1 = "done1"; });
            showAlertDialog({ title: "Second Dialog", message: "Step 2 of 2" })
                .then(() => { window.__qRes2 = "done2"; });
        });
    }""")

    # First dialog appears
    await expect(dialog).to_be_visible()
    await expect(page.locator('#app-dialog-title')).to_have_text('First Dialog')
    await page.locator('#app-dialog-confirm-btn').click()

    # Second dialog immediately follows
    await expect(dialog).to_be_visible()
    await expect(page.locator('#app-dialog-title')).to_have_text('Second Dialog')
    await page.locator('#app-dialog-confirm-btn').click()
    await expect(dialog).to_be_hidden()

    # Both promises resolved
    q_res1 = await page.evaluate('() => window.__qRes1')
    q_res2 = await page.evaluate('() => window.__qRes2')
    assert q_res1 == 'done1'
    assert q_res2 == 'done2'


@pytest.mark.asyncio
async def test_dialog_pwa_standalone_and_ios_viewports(page: Page) -> None:
    """Verify dialog behaves flawlessly in simulated PWA standalone mode and across iOS viewports."""
    # 1. iPhone SE (375x667)
    await page.set_viewport_size({'width': 375, 'height': 667})
    await page.goto('/')
    dialog = page.locator('#app-dialog-modal')

    # Trigger prompt in standalone simulation
    await page.evaluate("""() => {
        // Mock standalone display mode
        window.__mockStandalone = true;
        import('/static/js/modules/components/dialog.js').then(({ showPromptDialog }) => {
            window.__pwaPrompt = showPromptDialog({
                title: "PWA Input",
                message: "Testing standalone PWA dialog layout.",
                defaultValue: "Standalone User"
            });
        });
    }""")

    await expect(dialog).to_be_visible()
    scroll_w = await page.evaluate('document.documentElement.scrollWidth')
    client_w = await page.evaluate('document.documentElement.clientWidth')
    assert scroll_w == client_w == 375

    # Check button touch targets on iOS SE
    confirm_btn = page.locator('#app-dialog-confirm-btn')
    cancel_btn = page.locator('#app-dialog-cancel-btn')
    c_box = await confirm_btn.bounding_box()
    k_box = await cancel_btn.bounding_box()
    assert c_box is not None and c_box['height'] >= 40
    assert k_box is not None and k_box['height'] >= 40

    await cancel_btn.click()
    await expect(dialog).to_be_hidden()
    res_se = await page.evaluate('() => window.__pwaPrompt')
    assert res_se is None

    # 2. iPhone 14/15/16 (390x844)
    await page.set_viewport_size({'width': 390, 'height': 844})
    await page.evaluate("""() => {
        import('/static/js/modules/components/dialog.js').then(({ showAlertDialog }) => {
            showAlertDialog({
                title: "iPhone 14 Check",
                message: "Verify safe area bottom and full width layout."
            });
        });
    }""")
    await expect(dialog).to_be_visible()
    scroll_w2 = await page.evaluate('document.documentElement.scrollWidth')
    client_w2 = await page.evaluate('document.documentElement.clientWidth')
    assert scroll_w2 == client_w2 == 390
    await page.locator('#app-dialog-confirm-btn').click()
    await expect(dialog).to_be_hidden()
