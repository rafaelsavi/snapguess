import re
from pathlib import Path

STATIC_DIR = Path(__file__).resolve().parents[2] / 'static'
PLAYER_INPUT_JS = STATIC_DIR / 'js' / 'modules' / 'components' / 'player_input.js'
PLAYER_INPUT_CSS = STATIC_DIR / 'css' / 'components' / 'player_input.css'
INDEX_HTML = STATIC_DIR / 'index.html'


def test_player_input_js_exists_and_exports_class() -> None:
    assert PLAYER_INPUT_JS.exists(), f'{PLAYER_INPUT_JS} does not exist'
    content = PLAYER_INPUT_JS.read_text(encoding='utf-8')
    assert 'export class PlayerInput' in content


def test_player_input_has_required_methods() -> None:
    content = PLAYER_INPUT_JS.read_text(encoding='utf-8')
    required_methods = [
        '_renderBaseDom',
        '_bindEvents',
        '_isDuplicate',
        '_showFeedback',
        '_clearFeedback',
        'addPlayer',
        'removePlayer',
        'setPlayers',
        'getPlayers',
        '_sync',
        '_renderChips',
        '_updateBadge',
        '_updateAddBtnState',
        'focus',
        'showEmptyError',
        'updateLanguage',
    ]
    for method in required_methods:
        pattern = rf'\b{method}\s*\('
        assert re.search(pattern, content), f"Method '{method}' not found in PlayerInput class"


def test_player_input_add_btn_disabled_state() -> None:
    content = PLAYER_INPUT_JS.read_text(encoding='utf-8')
    assert 'this._updateAddBtnState()' in content
    assert 'this.addBtn.disabled' in content
    assert 'disabled' in content


def test_player_input_mobile_and_accessibility_attributes() -> None:
    content = PLAYER_INPUT_JS.read_text(encoding='utf-8')

    # Mobile virtual keyboard attributes
    assert 'autocapitalize="words"' in content
    assert 'autocomplete="off"' in content
    assert 'autocorrect="off"' in content
    assert 'spellcheck="false"' in content
    assert 'enterkeyhint="done"' in content

    # Accessibility attributes
    assert 'role="alert"' in content
    assert 'aria-live="polite"' in content
    assert 'aria-label' in content


def test_player_input_keyboard_and_paste_handling() -> None:
    content = PLAYER_INPUT_JS.read_text(encoding='utf-8')

    assert 'Enter' in content
    assert 'Backspace' in content
    assert 'paste' in content
    assert 'stopPropagation' in content
    assert 'preventDefault' in content


def test_player_input_css_covers_all_component_classes() -> None:
    assert PLAYER_INPUT_CSS.exists(), f'{PLAYER_INPUT_CSS} does not exist'
    css_content = PLAYER_INPUT_CSS.read_text(encoding='utf-8')

    required_classes = [
        '.player-input-group',
        '.player-count-badge',
        '.player-input-container',
        '.player-chip',
        '.player-chip-avatar',
        '.player-chip-name',
        '.player-chip-remove',
        '.player-input-entry-wrap',
        '.player-text-input',
        '.player-add-btn',
        '.player-input-feedback',
    ]

    for class_name in required_classes:
        assert class_name in css_content, f"Class '{class_name}' missing from player_input.css"


def test_player_input_markup_in_index_html() -> None:
    content = INDEX_HTML.read_text(encoding='utf-8')
    assert 'id="player-input-root"' in content
    assert 'id="player-count-badge"' in content
    assert 'id="players"' in content


def test_player_autocomplete_verified_account_injection() -> None:
    auto_js = (STATIC_DIR / 'js' / 'modules' / 'components' / 'player_autocomplete.js').read_text(encoding='utf-8')
    css_content = PLAYER_INPUT_CSS.read_text(encoding='utf-8')

    # 1. State imported and verified account prioritized
    assert 'import { state } from "../state.js";' in auto_js
    assert 'state.auth?.name' in auto_js
    assert 'is_auth: true' in auto_js
    assert 'items.unshift' in auto_js

    # 2. Uses localized verified account badge
    assert 'stats.verified_account' in auto_js
    assert 'is-auth' in auto_js

    # 3. CSS contains light and dark styling for verified account pill
    assert '.player-autocomplete-count.is-auth' in css_content
    assert '[data-theme="dark"] .player-autocomplete-count.is-auth' in css_content


def test_single_player_input_creator_name_component() -> None:
    single_input_file = STATIC_DIR / 'js' / 'modules' / 'components' / 'single_player_input.js'
    assert single_input_file.exists(), f'{single_input_file} does not exist'
    single_js = single_input_file.read_text(encoding='utf-8')
    admin_js = (STATIC_DIR / 'js' / 'modules' / 'admin.js').read_text(encoding='utf-8')
    app_js = (STATIC_DIR / 'js' / 'app.js').read_text(encoding='utf-8')
    index_html = INDEX_HTML.read_text(encoding='utf-8')

    # 1. Component exports and features
    assert 'export class SinglePlayerInput' in single_js
    assert 'export const CREATOR_NAME_STORAGE_KEY' in single_js
    assert 'resolvePlayerName' in single_js
    assert 'resolvePlayerName(this.storageKey, this.getFallback)' in single_js
    assert 'syncFromAuth' in single_js
    assert 'state.auth?.name' in single_js
    assert 'playerInitial' in single_js

    # 2. Markup in index.html
    assert 'id="challenge-creator-name-input"' in index_html
    assert 'id="challenge-creator-avatar-preview"' in index_html
    assert 'id="challenge-creator-locked-badge"' in index_html

    # 3. admin.js integration
    assert 'SinglePlayerInput' in admin_js
    assert '_creatorSingleInput' in admin_js
    assert '_creatorSingleInput.syncFromAuth()' in admin_js
    assert 'syncCreatorName' in admin_js

    # 4. app.js integration
    assert 'syncCreatorName' in app_js


def test_player_autocomplete_aria_and_toolbar_support() -> None:
    auto_file = STATIC_DIR / 'js' / 'modules' / 'components' / 'player_autocomplete.js'
    assert auto_file.exists(), f'{auto_file} does not exist'
    auto_js = auto_file.read_text(encoding='utf-8')

    # ARIA Combobox 1.2
    assert "role', 'combobox'" in auto_js
    assert "aria-autocomplete', 'list'" in auto_js
    assert "aria-expanded', 'false'" in auto_js
    assert "aria-expanded', 'true'" in auto_js
    assert "aria-haspopup', 'listbox'" in auto_js
    assert "aria-activedescendant'" in auto_js
    assert 'aria-selected' in auto_js

    # Hub search box and container anchor resolution
    assert "this.inputEl.closest('.hub-search-box')" in auto_js
    assert "this.inputEl.closest('.player-input-container')" in auto_js

    # State helpers
    assert 'isOpen()' in auto_js


def test_stats_players_search_autocomplete_and_deeplink() -> None:
    stats_js = (STATIC_DIR / 'js' / 'modules' / 'screens' / 'stats.js').read_text(encoding='utf-8')
    stats_css = (STATIC_DIR / 'css' / 'components' / 'stats.css').read_text(encoding='utf-8')

    # 1. Autocomplete attachment
    assert 'import { attachPlayerAutocomplete }' in stats_js
    assert 'attachPlayerAutocomplete(playerSearch' in stats_js
    assert '_playerAutocomplete' in stats_js

    # 2. Escape key handling
    assert 'Escape' in stats_js
    assert '_playerAutocomplete.isOpen()' in stats_js

    # 3. Query string deep linking
    assert 'showPlayerDirectory(initialSearch = null)' in stats_js
    assert 'urlParams.get("search")' in stats_js

    # 4. Replay link from player profile
    assert 'profile-view-all-replays-link' in stats_js
    assert 'stats.view_all_player_replays' in stats_js
    assert '.recent-matches-card-header' in stats_css
    assert '.profile-all-replays-link' in stats_css


def test_replays_player_search_and_sort_select() -> None:
    replay_js = (STATIC_DIR / 'js' / 'modules' / 'screens' / 'replay.js').read_text(encoding='utf-8')
    replay_css = (STATIC_DIR / 'css' / 'components' / 'replay.css').read_text(encoding='utf-8')
    index_html = INDEX_HTML.read_text(encoding='utf-8')

    # 1. Standardized HubToolbar component integration
    assert 'import { setupHubToolbar }' in replay_js
    assert 'setupHubToolbar({' in replay_js
    assert '_replaysToolbar' in replay_js
    assert '_replaysSearch' in replay_js

    # 2. Multi-player parsing and clean hub search state (no bloated search chips)
    assert 'parsePlayerNames' in replay_js
    assert 'getFilteredPlayers' in replay_js
    assert 'addFilteredPlayer' in replay_js
    assert 'removeFilteredPlayer' in replay_js
    assert 'clearFilteredPlayers' in replay_js
    assert 'id="stats-replays-search-box"' in index_html
    assert 'id="stats-replays-player-search"' in index_html
    assert 'id="stats-replays-chips-wrap"' not in index_html
    assert '.replays-search-chip-box' not in replay_css
    assert '.replays-search-chips' not in replay_css
    assert '.replays-chip-input' not in replay_css

    # 3. Player chips on match cards
    assert 'replay-player-chip' in replay_js
    assert '.replay-player-chip' in replay_css

    # 4. Removed My Matches shortcut & retained Sort select
    assert 'id="stats-replays-my-matches-btn"' not in index_html
    assert 'stats-replays-my-matches-btn' not in replay_js
    assert '.replays-my-matches-pill' not in replay_css
    assert 'replay.my_matches_filter' not in index_html
    assert 'id="stats-replays-sort-select"' in index_html
    assert 'stats-replays-sort-select' in replay_js
    assert 'replay.sort_newest' in index_html

    # 5. Query string deep linking
    assert 'showReplaysCatalog(initialPlayer = null)' in replay_js
    assert 'urlParams.get("player")' in replay_js
    assert 'urlParams.get("sort")' in replay_js

    # 6. Clear and state sync
    assert '_replaysSearch.setValue' in replay_js
    assert '_replaysSearch.clear' in replay_js


def test_hub_search_standardization_across_screens() -> None:
    hub_search_file = STATIC_DIR / 'js' / 'modules' / 'components' / 'hub_search.js'
    hub_toolbar_file = STATIC_DIR / 'js' / 'modules' / 'components' / 'hub_toolbar.js'
    assert hub_search_file.exists(), f'{hub_search_file} does not exist'
    assert hub_toolbar_file.exists(), f'{hub_toolbar_file} does not exist'
    hub_search_js = hub_search_file.read_text(encoding='utf-8')
    hub_toolbar_js = hub_toolbar_file.read_text(encoding='utf-8')
    challenges_js = (STATIC_DIR / 'js' / 'modules' / 'screens' / 'challenges.js').read_text(encoding='utf-8')
    replay_js = (STATIC_DIR / 'js' / 'modules' / 'screens' / 'replay.js').read_text(encoding='utf-8')
    toolbar_css = (STATIC_DIR / 'css' / 'components' / 'toolbar.css').read_text(encoding='utf-8')
    index_html = INDEX_HTML.read_text(encoding='utf-8')

    # 1. Component exports and features
    assert 'export class HubSearch' in hub_search_js
    assert 'export function setupHubSearch' in hub_search_js
    assert 'export class HubToolbar' in hub_toolbar_js
    assert 'export function setupHubToolbar' in hub_toolbar_js
    assert 'syncClearButton()' in hub_search_js
    assert 'setValue(val, trigger = true)' in hub_search_js
    assert 'clear(trigger = true)' in hub_search_js

    # 2. Shared usage in Challenges and Replays
    assert 'setupHubToolbar({' in challenges_js
    assert 'setupHubToolbar({' in replay_js

    # 3. Standardized markup classes in index.html
    assert 'class="hub-toolbar challenges-toolbar"' in index_html
    assert 'class="hub-toolbar replays-toolbar"' in index_html
    assert 'class="hub-search-box challenges-search-wrap"' in index_html
    assert 'class="hub-search-box replays-search-wrap"' in index_html
    clear_tooltip = 'data-i18n-title="common.clear_search" data-i18n-aria-label="common.clear_search"'
    challenges_clear = index_html[index_html.index('id="challenges-search-clear"') :]
    replays_clear = index_html[index_html.index('id="stats-replays-search-clear"') :]
    assert clear_tooltip in challenges_clear[:300]
    assert clear_tooltip in replays_clear[:300]

    # 4. Standardized toolbar CSS rules
    assert (
        '.challenges-toolbar,\n.replays-toolbar' in toolbar_css
        or '.challenges-toolbar, .replays-toolbar' in toolbar_css
        or '.replays-toolbar' in toolbar_css
    )
    assert '.replays-search-wrap' in toolbar_css
    assert '.replays-search-input' in toolbar_css


def test_player_autocomplete_multiple_and_toolbar_width() -> None:
    autocomplete_file = STATIC_DIR / 'js' / 'modules' / 'components' / 'player_autocomplete.js'
    autocomplete_js = autocomplete_file.read_text(encoding='utf-8')
    toolbar_css = (STATIC_DIR / 'css' / 'components' / 'toolbar.css').read_text(encoding='utf-8')

    # PlayerAutocomplete supports multiple tokens
    assert 'this.multiple = Boolean(options.multiple)' in autocomplete_js
    assert '_parseTokens()' in autocomplete_js

    # Desktop toolbar search width allows expanded line usage
    assert '.hub-search-box.stats-search-wrap' in toolbar_css
    assert 'max-width: 620px' in toolbar_css


def test_player_autocomplete_click_isolation_no_pointerdown_premature_close() -> None:
    autocomplete_file = STATIC_DIR / 'js' / 'modules' / 'components' / 'player_autocomplete.js'
    autocomplete_js = autocomplete_file.read_text(encoding='utf-8')

    # 1. Blur prevention without early selection on pointerdown/mousedown
    assert "this.dropdownEl.addEventListener('pointerdown'" in autocomplete_js
    assert "this.dropdownEl.addEventListener('mousedown'" in autocomplete_js
    assert "el.addEventListener('pointerdown'" in autocomplete_js
    assert "el.addEventListener('mousedown'" in autocomplete_js

    # 2. Strict click-based selection prevents click-through ghosting onto underlying UI
    assert "el.addEventListener('click', (e) => {" in autocomplete_js
    assert 'this._selectIndex(idx)' in autocomplete_js

    # 3. Ensure pointerdown does not directly invoke _selectIndex
    # (which would destroy the dropdown before gesture completion, causing click fall-through)
    assert "el.addEventListener('pointerdown', handleSelect)" not in autocomplete_js
