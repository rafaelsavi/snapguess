/**
 * Lightweight Player Name Autocomplete Dropdown
 * Fetches recent and frequent players from /api/players/names
 * Provides accessible keyboard navigation, colored avatar initials, and match count pill.
 */
import { t } from "../i18n.js";
import { state } from "../state.js";

export class PlayerAutocomplete {
  /**
   * @param {HTMLInputElement} inputEl - Target text input
   * @param {Object} [options]
   * @param {function(string): void} [options.onSelect] - Callback when player selected
   * @param {function(): string[]} [options.getExcludedNames] - Names to exclude (e.g. already selected)
   */
  constructor(inputEl, options = {}) {
    if (!inputEl) return;
    this.inputEl = inputEl;
    this.multiple = Boolean(options.multiple);
    this.onSelect = options.onSelect || null;
    this.getExcludedNames = options.getExcludedNames || (() => []);
    this.dropdownEl = null;
    this.selectedIndex = -1;
    this.items = [];
    this._debounceTimer = null;
    this._cachedNames = null;
    this._fetchId = 0;

    this._init();
  }

  _init() {
    // Create dropdown element
    this.dropdownEl = document.createElement('div');
    this.dropdownEl.className = 'player-autocomplete-dropdown hidden';
    this.dropdownEl.setAttribute('role', 'listbox');
    this.dropdownEl.id = `autocomplete-${Math.random().toString(36).slice(2, 9)}`;

    // Position relative to player-input-container, hub-search-box, or parentElement
    this.anchorEl = this.inputEl.closest('.player-input-container') || this.inputEl.closest('.hub-search-box') || this.inputEl.parentElement;
    if (this.anchorEl) {
      if (getComputedStyle(this.anchorEl).position === 'static') {
        this.anchorEl.style.position = 'relative';
      }
      this.anchorEl.appendChild(this.dropdownEl);
    }

    // ARIA Combobox 1.2 Attributes on input
    this.inputEl.setAttribute('role', 'combobox');
    this.inputEl.setAttribute('aria-autocomplete', 'list');
    this.inputEl.setAttribute('aria-expanded', 'false');
    this.inputEl.setAttribute('aria-haspopup', 'listbox');
    this.inputEl.setAttribute('aria-controls', this.dropdownEl.id);

    // Prevent input blur when tapping or scrolling inside dropdown
    this.dropdownEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
    });
    this.dropdownEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    // Bind event handlers
    this.inputEl.addEventListener('input', () => this._onInput());
    this.inputEl.addEventListener('focus', () => this._onFocus());
    this.inputEl.addEventListener('blur', () => {
      setTimeout(() => this.close(), 200);
    });
    this.inputEl.addEventListener('keydown', (e) => this._onKeyDown(e));

    if (this.inputEl.form) {
      this.inputEl.form.addEventListener('submit', () => this.close());
    }

    this._onDocPointerDown = (e) => {
      if (
        !this.inputEl.contains(e.target) &&
        !this.dropdownEl.contains(e.target) &&
        !(this.anchorEl && this.anchorEl.contains(e.target))
      ) {
        this.close();
      }
    };
    document.addEventListener('pointerdown', this._onDocPointerDown);

    this._onResize = () => {
      if (this.dropdownEl && !this.dropdownEl.classList.contains('hidden')) {
        this._updatePosition();
      }
    };
    window.addEventListener('resize', this._onResize);
  }

  isOpen() {
    return Boolean(this.dropdownEl && !this.dropdownEl.classList.contains('hidden'));
  }

  _parseTokens() {
    const val = this.inputEl.value || '';
    if (!this.multiple) {
      return {
        prefix: '',
        currentToken: val.trim(),
        suffix: '',
        excluded: (this.getExcludedNames() || []).map((n) => n.toLowerCase()),
      };
    }

    const cursorPos = this.inputEl.selectionStart ?? val.length;
    const beforeCursor = val.slice(0, cursorPos);
    const afterCursor = val.slice(cursorPos);

    // Match the token right before cursor after delimiter (comma, semicolon, &)
    const lastDelimMatch = beforeCursor.match(/^(.*(?:[,;]|\s+[&+]\s+)\s*)(.*)$/);
    let prefix = '';
    let tokenBefore = beforeCursor;
    if (lastDelimMatch) {
      prefix = lastDelimMatch[1];
      tokenBefore = lastDelimMatch[2];
    }

    // Match trailing characters of the active token after cursor up to next delimiter
    const nextDelimMatch = afterCursor.match(/^([^,;&+]*)(.*)$/);
    let tokenAfter = '';
    let suffix = afterCursor;
    if (nextDelimMatch) {
      tokenAfter = nextDelimMatch[1];
      suffix = nextDelimMatch[2];
    }

    const currentToken = (tokenBefore + tokenAfter).trim();

    // Collect other completed tokens to exclude them from suggestions
    const allTokens = val
      .split(/[,;]+|\s+[&+]\s+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const otherTokens = allTokens.filter((t) => t !== currentToken.toLowerCase());
    const externalExcluded = (this.getExcludedNames() || []).map((n) => n.toLowerCase());
    const excluded = Array.from(new Set([...otherTokens, ...externalExcluded]));

    return { prefix, currentToken, suffix, excluded };
  }

  _onFocus() {
    const { currentToken, excluded } = this._parseTokens();
    this._fetchSuggestions(currentToken, excluded);
  }

  _onInput() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      const { currentToken, excluded } = this._parseTokens();
      this._fetchSuggestions(currentToken, excluded);
    }, 150);
  }

  async _fetchSuggestions(query, excludedList = null) {
    const currentFetchId = ++this._fetchId;
    try {
      const res = await fetch(`/api/players/names?q=${encodeURIComponent(query)}&limit=10`);
      if (!res.ok) return;
      if (currentFetchId !== this._fetchId) return;
      if (document.activeElement !== this.inputEl) return;
      const { currentToken } = this._parseTokens();
      if (currentToken !== query) return;

      const suggestions = await res.json();
      if (currentFetchId !== this._fetchId) return;
      if (document.activeElement !== this.inputEl) return;

      const excluded = new Set(
        excludedList || (this.getExcludedNames() || []).map((n) => n.toLowerCase())
      );

      let items = suggestions.filter((item) => !excluded.has(item.player_name.toLowerCase()));

      // Prioritize authenticated account name if present and not already selected/excluded
      const authName = (state.auth?.name || "").trim();
      if (authName && !excluded.has(authName.toLowerCase())) {
        const matchesQuery = !query || authName.toLowerCase().includes(query.toLowerCase());
        if (matchesQuery) {
          const existingIdx = items.findIndex(
            (item) => item.player_name.toLowerCase() === authName.toLowerCase()
          );
          if (existingIdx >= 0) {
            const existing = items.splice(existingIdx, 1)[0];
            items.unshift({ ...existing, is_auth: true });
          } else {
            items.unshift({
              player_name: authName,
              color: "#3b82f6",
              match_count: 0,
              is_auth: true,
            });
          }
        }
      }

      this.items = items;

      // If user has already typed the exact full name and it's the only match, don't obstruct buttons
      if (
        this.items.length === 1 &&
        query.length > 0 &&
        this.items[0].player_name.toLowerCase() === query.toLowerCase()
      ) {
        this.close();
        return;
      }

      this._renderDropdown();
    } catch (err) {
      console.warn('Failed to fetch player autocomplete suggestions:', err);
    }
  }

  _renderDropdown() {
    if (!this.items || this.items.length === 0) {
      this.close();
      return;
    }

    this.selectedIndex = -1;
    this.dropdownEl.innerHTML = this.items
      .map((item, idx) => {
        const initial = (item.player_name || '?').charAt(0).toUpperCase();
        const color = item.color || '#3b82f6';
        let matchLabel = '';
        let badgeClass = 'player-autocomplete-count';
        if (item.is_auth) {
          badgeClass += ' is-auth';
          matchLabel = t("stats.verified_account");
        } else if (item.match_count === 1) {
          matchLabel = t("stats.match_count_single", 1);
        } else {
          matchLabel = t("stats.match_count_plural", item.match_count || 0);
        }

        const optId = `${this.dropdownEl.id}-opt-${idx}`;
        return `
          <div id="${optId}" class="player-autocomplete-item${item.is_auth ? ' is-auth-item' : ''}" role="option" aria-selected="false" data-index="${idx}">
            <div class="player-autocomplete-avatar${item.is_auth ? ' is-auth user-gold-avatar' : ''}" style="background-color: ${color}">
              ${initial}
            </div>
            <div class="player-autocomplete-info">
              <span class="player-autocomplete-name">${this._escapeHtml(item.player_name)}</span>
              <span class="${badgeClass}">${matchLabel}</span>
            </div>
          </div>
        `;
      })
      .join('');

    this.dropdownEl.querySelectorAll('.player-autocomplete-item').forEach((el) => {
      // Prevent input blur and unwanted text selection when pressing down on an option
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
      });
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });

      // Handle selection strictly on click so gesture completion does not fall through to elements behind the dropdown
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(el.getAttribute('data-index'), 10);
        this._selectIndex(idx);
      });
    });

    this.dropdownEl.classList.remove('hidden');
    this.inputEl.setAttribute('aria-expanded', 'true');
    this._updatePosition();
  }

  _updatePosition() {
    if (!this.dropdownEl || !this.anchorEl) return;

    const anchorRect = this.anchorEl.getBoundingClientRect();
    const dropdownHeight = Math.min(this.dropdownEl.scrollHeight || 220, 240);
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceAbove = anchorRect.top;

    // Flip upwards if space below is too small to fit the dropdown and space above has more clearance
    if (spaceBelow < dropdownHeight + 12 && spaceAbove > spaceBelow) {
      this.dropdownEl.classList.add('open-upwards');
    } else {
      this.dropdownEl.classList.remove('open-upwards');
    }
  }

  _onKeyDown(e) {
    if (this.dropdownEl.classList.contains('hidden') || this.items.length === 0) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
      this._updateActiveOption();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
      this._updateActiveOption();
    } else if (e.key === 'Enter') {
      if (this.selectedIndex >= 0 && this.selectedIndex < this.items.length) {
        e.preventDefault();
        e.stopPropagation();
        this._selectIndex(this.selectedIndex);
      } else {
        this.close();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  }

  _updateActiveOption() {
    const opts = this.dropdownEl.querySelectorAll('.player-autocomplete-item');
    opts.forEach((opt, idx) => {
      if (idx === this.selectedIndex) {
        opt.classList.add('active');
        opt.setAttribute('aria-selected', 'true');
        opt.scrollIntoView({ block: 'nearest' });
        this.inputEl.setAttribute('aria-activedescendant', opt.id);
      } else {
        opt.classList.remove('active');
        opt.setAttribute('aria-selected', 'false');
      }
    });
  }

  _selectIndex(idx) {
    const item = this.items[idx];
    if (!item) return;

    let newValue = item.player_name;
    let targetCursorPos = newValue.length;

    if (this.multiple) {
      const { prefix, suffix } = this._parseTokens();
      newValue = `${prefix}${item.player_name}${suffix}`;
      targetCursorPos = (prefix ? prefix.length : 0) + item.player_name.length;
    }

    if (this.onSelect) {
      this.onSelect(newValue, item);
    } else {
      this.inputEl.value = newValue;
      this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      this.inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.close();
    this.inputEl.focus();

    if (this.multiple) {
      try {
        const pos = Math.min(targetCursorPos, this.inputEl.value.length);
        this.inputEl.setSelectionRange(pos, pos);
      } catch (_) {}
    }
  }

  close() {
    this._fetchId = (this._fetchId || 0) + 1;
    clearTimeout(this._debounceTimer);
    if (this.dropdownEl) {
      this.dropdownEl.classList.add('hidden');
      this.dropdownEl.innerHTML = '';
      this.selectedIndex = -1;
    }
    if (this.inputEl) {
      this.inputEl.setAttribute('aria-expanded', 'false');
      this.inputEl.removeAttribute('aria-activedescendant');
    }
  }

  destroy() {
    this.close();
    if (this._onDocPointerDown) {
      document.removeEventListener('pointerdown', this._onDocPointerDown);
    }
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
    }
    if (this.dropdownEl && this.dropdownEl.parentElement) {
      this.dropdownEl.parentElement.removeChild(this.dropdownEl);
    }
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * Convenience helper to attach autocomplete to an input
 */
export function attachPlayerAutocomplete(inputEl, options = {}) {
  return new PlayerAutocomplete(inputEl, options);
}
