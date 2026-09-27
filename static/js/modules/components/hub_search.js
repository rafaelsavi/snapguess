/**
 * Unified Hub Search Controller
 * Provides standardized instant search, clear button synchronization,
 * keyboard shortcuts (Escape, Enter), and optional debouncing across
 * Challenges Hub, Match Replays, Player Directory, and Hub screens.
 */

export class HubSearch {
  /**
   * @param {Object} options
   * @param {HTMLInputElement|string} options.input - Input element or selector/ID
   * @param {HTMLElement|string} [options.clearBtn] - Clear button element or selector/ID
   * @param {function(string, boolean): void} [options.onSearch] - Search callback (query, isImmediate)
   * @param {function(): void} [options.onClear] - Clear callback
   * @param {number} [options.debounceMs=0] - Debounce delay in ms (0 for instant client-side)
   */
  constructor(options = {}) {
    this.inputEl = typeof options.input === "string"
      ? (document.getElementById(options.input) || document.querySelector(options.input))
      : options.input;

    this.clearBtnEl = typeof options.clearBtn === "string"
      ? (document.getElementById(options.clearBtn) || document.querySelector(options.clearBtn))
      : options.clearBtn;

    this.onSearch = options.onSearch || (() => {});
    this.onClear = options.onClear || null;
    this.debounceMs = Number(options.debounceMs) || 0;
    this._debounceTimer = null;

    if (this.inputEl) {
      this._bindEvents();
      this.syncClearButton();
    }
  }

  _bindEvents() {
    this.inputEl.addEventListener("input", (e) => {
      this.syncClearButton();
      const query = (e.target.value || "").trim();

      if (this.debounceMs > 0) {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
          this.onSearch(query, false);
        }, this.debounceMs);
      } else {
        this.onSearch(query, false);
      }
    });

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.inputEl.value) {
          e.preventDefault();
          this.clear(true);
        }
      } else if (e.key === "Enter") {
        clearTimeout(this._debounceTimer);
        this.onSearch((this.inputEl.value || "").trim(), true);
      }
    });

    this.inputEl.addEventListener("search", () => {
      if (!this.inputEl.value) {
        this.clear(true);
      }
    });

    if (this.clearBtnEl) {
      this.clearBtnEl.addEventListener("click", () => {
        this.clear(true);
        this.inputEl.focus();
      });
    }
  }

  syncClearButton() {
    if (this.clearBtnEl && this.inputEl) {
      const hasText = Boolean((this.inputEl.value || "").trim());
      this.clearBtnEl.classList.toggle("hidden", !hasText);
    }
  }

  getValue() {
    return this.inputEl ? (this.inputEl.value || "").trim() : "";
  }

  setValue(val, trigger = true) {
    if (!this.inputEl) return;
    this.inputEl.value = val || "";
    this.syncClearButton();
    clearTimeout(this._debounceTimer);
    if (trigger) {
      this.onSearch((this.inputEl.value || "").trim(), true);
    }
  }

  clear(trigger = true) {
    if (!this.inputEl) return;
    this.inputEl.value = "";
    this.syncClearButton();
    clearTimeout(this._debounceTimer);
    if (trigger) {
      if (this.onClear) {
        this.onClear();
      } else {
        this.onSearch("", true);
      }
    }
  }

  focus() {
    if (this.inputEl) {
      this.inputEl.focus();
    }
  }
}

/**
 * Convenience factory function to instantiate HubSearch.
 * @param {Object} options
 * @returns {HubSearch|null}
 */
export function setupHubSearch(options) {
  const instance = new HubSearch(options);
  return instance.inputEl ? instance : null;
}

export { HubToolbar, setupHubToolbar } from "./hub_toolbar.js";
