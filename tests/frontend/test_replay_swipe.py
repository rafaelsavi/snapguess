import json
import re
from pathlib import Path

STATIC_DIR = Path(__file__).resolve().parents[2] / 'static'
LOCALES_DIR = Path(__file__).resolve().parents[2] / 'locales'
ROUND_STAGE_JS = STATIC_DIR / 'js' / 'modules' / 'components' / 'round_stage.js'
MATCH_REPLAY_JS = STATIC_DIR / 'js' / 'modules' / 'components' / 'match_replay.js'
LIGHTBOX_JS = STATIC_DIR / 'js' / 'modules' / 'components' / 'lightbox.js'
REVIEW_DECK_JS = STATIC_DIR / 'js' / 'modules' / 'components' / 'review_deck.js'
POLAROIDS_JS = STATIC_DIR / 'js' / 'modules' / 'summary' / 'polaroids.js'
ROUND_STAGE_CSS = STATIC_DIR / 'css' / 'components' / 'round_stage.css'
REPLAY_CSS = STATIC_DIR / 'css' / 'components' / 'replay.css'
CARDS_CSS = STATIC_DIR / 'css' / 'components' / 'cards.css'
REVIEW_DECK_CSS = STATIC_DIR / 'css' / 'components' / 'review_deck.css'


def test_round_stage_has_swipe_support_and_methods() -> None:
    assert ROUND_STAGE_JS.exists(), f'{ROUND_STAGE_JS} does not exist'
    content = ROUND_STAGE_JS.read_text(encoding='utf-8')

    assert 'onSwipeNext' in content, 'RoundStage must accept onSwipeNext callback'
    assert 'onSwipePrev' in content, 'RoundStage must accept onSwipePrev callback'
    assert '_initSwipeGestures' in content, 'RoundStage must initialize swipe gestures'
    assert 'handleSwipe' in content, 'RoundStage must implement handleSwipe'
    assert 'applySwipeAnimation' in content, 'RoundStage must implement applySwipeAnimation'
    assert 'applyEdgeBounce' in content, 'RoundStage must implement applyEdgeBounce'
    assert 'destroy' in content, 'RoundStage must implement destroy cleanup'

    # Verify touch event listeners registered
    assert 'touchstart' in content
    assert 'touchmove' in content
    assert 'touchend' in content
    assert 'touchcancel' in content


def test_match_replay_viewer_wires_round_swipe_and_stepper() -> None:
    assert MATCH_REPLAY_JS.exists(), f'{MATCH_REPLAY_JS} does not exist'
    content = MATCH_REPLAY_JS.read_text(encoding='utf-8')

    # RoundStage constructor receives onSwipeNext and onSwipePrev
    assert 'onSwipeNext:' in content
    assert 'onSwipePrev:' in content

    # goToRound accepts startAtLastPhoto and swipeAnimation
    assert 'goToRound(idx, { startAtLastPhoto = false, swipeAnimation = null } = {})' in content
    assert 'renderCurrentRound({ startAtLastPhoto, swipeAnimation })' in content

    # Stepper has touch gesture support
    assert 'replay-round-stepper' in content
    assert '_cleanupStepperSwipe' in content

    # Viewer cleans up on destroy
    assert 'this.roundStage.destroy()' in content
    assert 'this._cleanupStepperSwipe()' in content


def test_lightbox_gallery_navigation_and_swipe() -> None:
    assert LIGHTBOX_JS.exists(), f'{LIGHTBOX_JS} does not exist'
    content = LIGHTBOX_JS.read_text(encoding='utf-8')

    # Supports gallery options
    assert 'openPhotoLightbox(src, { photos = null, currentIndex = 0, onIndexChange = null } = {})' in content
    assert 'photo-lightbox-prev' in content
    assert 'photo-lightbox-next' in content
    assert 'photo-lightbox-counter' in content

    # Touch swipe listeners on lightbox
    assert 'touchstart' in content
    assert 'touchmove' in content
    assert 'touchend' in content
    assert 'navigateLightbox' in content

    # Keyboard arrow navigation
    assert 'ArrowLeft' in content
    assert 'ArrowRight' in content


def test_polaroids_pass_gallery_to_lightbox() -> None:
    assert POLAROIDS_JS.exists(), f'{POLAROIDS_JS} does not exist'
    content = POLAROIDS_JS.read_text(encoding='utf-8')

    assert 'allPhotoUrls' in content
    assert 'openPhotoLightbox' in content
    assert 'photos: allPhotoUrls.length > 1 ? allPhotoUrls : null' in content
    assert 'currentIndex' in content


def test_review_deck_has_tabs_swipe() -> None:
    assert REVIEW_DECK_JS.exists(), f'{REVIEW_DECK_JS} does not exist'
    content = REVIEW_DECK_JS.read_text(encoding='utf-8')

    assert 'review-deck-tabs-container' in content
    assert '_cleanupTabsSwipe' in content
    assert 'this._cleanupTabsSwipe()' in content


def test_css_swipe_animations_and_touch_action() -> None:
    stage_css = ROUND_STAGE_CSS.read_text(encoding='utf-8')
    assert 'touch-action: pan-y pinch-zoom;' in stage_css
    assert 'photoSwipeInNext' in stage_css
    assert 'photoSwipeInPrev' in stage_css
    assert 'photoEdgeBounceLeft' in stage_css
    assert 'photoEdgeBounceRight' in stage_css
    assert '.photo-swipe-next' in stage_css
    assert '.photo-swipe-prev' in stage_css
    assert 'prefers-reduced-motion' in stage_css

    replay_css = REPLAY_CSS.read_text(encoding='utf-8')
    assert 'touch-action: pan-y;' in replay_css

    cards_css = CARDS_CSS.read_text(encoding='utf-8')
    assert '.photo-lightbox-nav' in cards_css
    assert '.photo-lightbox-counter' in cards_css

    review_css = REVIEW_DECK_CSS.read_text(encoding='utf-8')
    assert 'touch-action: pan-y;' in review_css


def test_locale_parity_for_lightbox_navigation_keys() -> None:
    en_json = json.loads((LOCALES_DIR / 'en-US.json').read_text(encoding='utf-8'))
    pt_json = json.loads((LOCALES_DIR / 'pt-BR.json').read_text(encoding='utf-8'))
    en_js_text = (STATIC_DIR / 'js' / 'modules' / 'locales' / 'en_US.js').read_text(encoding='utf-8')
    pt_js_text = (STATIC_DIR / 'js' / 'modules' / 'locales' / 'pt_BR.js').read_text(encoding='utf-8')

    en_js_keys = set(re.findall(r'["\']([a-zA-Z0-9_.]+)["\']\s*:', en_js_text))
    pt_js_keys = set(re.findall(r'["\']([a-zA-Z0-9_.]+)["\']\s*:', pt_js_text))

    for key in ('game.prev_photo', 'game.next_photo', 'game.reset_zoom'):
        assert key in en_json
        assert key in pt_json
        assert key in en_js_keys
        assert key in pt_js_keys


def test_lightbox_zoom_and_pan() -> None:
    assert LIGHTBOX_JS.exists(), f'{LIGHTBOX_JS} does not exist'
    content = LIGHTBOX_JS.read_text(encoding='utf-8')

    # Zoom functions and exports
    assert 'export function resetLightboxZoom(' in content
    assert 'export function getLightboxScale(' in content
    assert 'photo-lightbox-zoom-reset' in content
    assert 'photo-lightbox-zoom-label' in content

    # Multi-touch pinch & pan gestures
    assert 'isPinching' in content
    assert 'pinchStartDist' in content
    assert '_clampTranslations' in content
    assert '_zoomToPoint' in content

    # Double-tap and wheel support
    assert 'distFromLastTap' in content
    assert 'wheel' in content
    assert 'is-zoomed' in content

    # CSS verification
    cards_css = CARDS_CSS.read_text(encoding='utf-8')
    assert '.photo-lightbox-zoom-reset' in cards_css
    assert '.photo-lightbox-overlay.is-zoomed' in cards_css
    assert 'cursor: zoom-in' in cards_css
    assert 'touch-action: none' in cards_css
