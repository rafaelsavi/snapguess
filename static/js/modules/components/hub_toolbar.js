/**
 * Reusable Hub Toolbar Component
 *
 * Provides a standardized controller for hub and catalog toolbars across
 * Challenges Hub, Match Replays, Player Directory, and Moderation views.
 *
 * Encapsulates:
 * - Search input with instant/debounced callback, clear button sync, Escape/Enter shortcuts.
 * - Segmented filter tabs (All | Active | Expired, etc.).
 * - Dropdown filter selects (Game Mode, Sorting, Play Type).
 * - Action pill buttons (e.g. My Matches quick toggle).
 * - Counter badge synchronization.
 */

import { HubSearch } from "./hub_search.js";

export class HubToolbar {
  /**
   * @param {Object} options
   * @param {HTMLElement|string} options.container - Toolbar container element or selector
   * @param {Object} [options.search] - Search config: { input, clearBtn, debounceMs, onSearch, onClear }
   * @param {Object} [options.tabs] - Segmented pills config: { container, dataAttr, defaultTab, onChange }
   * @param {Array<string|HTMLSelectElement>} [options.selects] - Select elements to track
   * @param {HTMLElement|string} [options.counterBadge] - Counter badge element or selector
   * @param {function(Object): void} [options.onChange] - Unified callback invoked when any filter changes
   */
  constructor(options = {}) {
    this.containerEl = typeof options.container === "string"
      ? (document.getElementById(options.container) || document.querySelector(options.container))
      : options.container;

    this.onChange = options.onChange || null;

    // 1. Search Component
    this.search = null;
    if (options.search && options.search.input) {
      const searchOptions = {
        ...options.search,
        onSearch: (query, immediate) => {
          if (options.search.onSearch) options.search.onSearch(query, immediate);
          this._notifyChange("search", query);
        },
        onClear: () => {
          if (options.search.onClear) options.search.onClear();
          this._notifyChange("search", "");
        },
      };
      this.search = new HubSearch(searchOptions);
    }

    // 2. Segmented Filter Tabs
    this.tabsContainerEl = null;
    this.tabDataAttr = (options.tabs && options.tabs.dataAttr) || "status";
    this.activeTab = (options.tabs && options.tabs.defaultTab) || "all";
    this.onTabChange = (options.tabs && options.tabs.onChange) || null;

    if (options.tabs && options.tabs.container) {
      this.tabsContainerEl = typeof options.tabs.container === "string"
        ? (document.getElementById(options.tabs.container) || document.querySelector(options.tabs.container))
        : options.tabs.container;
      this._bindTabs();
    }

    // 3. Dropdown Selects
    this.selectEls = new Map();
    if (Array.isArray(options.selects)) {
      options.selects.forEach((sel) => {
        const el = typeof sel === "string"
          ? (document.getElementById(sel) || document.querySelector(sel))
          : sel;
        if (el && el.id) {
          this.selectEls.set(el.id, el);
          el.addEventListener("change", () => {
            this._notifyChange("select", { id: el.id, value: el.value });
          });
        }
      });
    }

    // 4. Counter Badge
    this.counterBadgeEl = typeof options.counterBadge === "string"
      ? (document.getElementById(options.counterBadge) || document.querySelector(options.counterBadge))
      : options.counterBadge;
  }

  _bindTabs() {
    if (!this.tabsContainerEl) return;
    this.tabsContainerEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-pill");
      if (!btn) return;
      const tabVal = btn.dataset[this.tabDataAttr] || btn.getAttribute(`data-${this.tabDataAttr}`);
      if (!tabVal || tabVal === this.activeTab) return;

      this.setActiveTab(tabVal, true);
    });
  }

  _notifyChange(source, data) {
    if (typeof this.onChange === "function") {
      this.onChange({
        source,
        data,
        filters: this.getFilters(),
      });
    }
  }

  // --- Public API ---

  getActiveTab() {
    return this.activeTab;
  }

  setActiveTab(tabValue, trigger = true) {
    this.activeTab = tabValue;
    if (this.tabsContainerEl) {
      const pills = this.tabsContainerEl.querySelectorAll(".filter-pill");
      pills.forEach((p) => {
        const val = p.dataset[this.tabDataAttr] || p.getAttribute(`data-${this.tabDataAttr}`);
        p.classList.toggle("active", val === tabValue);
      });
    }
    if (trigger) {
      if (typeof this.onTabChange === "function") {
        this.onTabChange(tabValue);
      }
      this._notifyChange("tab", tabValue);
    }
  }

  getSearchQuery() {
    return this.search ? this.search.getValue() : "";
  }

  setSearchQuery(query, trigger = true) {
    if (this.search) {
      this.search.setValue(query, trigger);
    }
  }

  clearSearch(trigger = true) {
    if (this.search) {
      this.search.clear(trigger);
    }
  }

  getSelectValue(selectId) {
    const el = this.selectEls.get(selectId);
    return el ? el.value : "";
  }

  setSelectValue(selectId, value, trigger = true) {
    const el = this.selectEls.get(selectId);
    if (!el) return;
    el.value = value;
    if (trigger) {
      el.dispatchEvent(new Event("change"));
    }
  }

  getFilters() {
    const result = {
      search: this.getSearchQuery(),
      tab: this.activeTab,
      selects: {},
    };
    for (const [id, el] of this.selectEls.entries()) {
      result.selects[id] = el.value;
    }
    return result;
  }

  updateCounterBadge(text, isVisible = true) {
    if (!this.counterBadgeEl) return;
    this.counterBadgeEl.textContent = text || "";
    this.counterBadgeEl.classList.toggle("hidden", !isVisible || !text);
  }

  setCounterBadgeCount(count, labelSingle, labelPlural) {
    if (!this.counterBadgeEl) return;
    const num = Number(count) || 0;
    if (num <= 0) {
      this.counterBadgeEl.classList.add("hidden");
      return;
    }
    const label = num === 1 ? labelSingle : labelPlural;
    this.counterBadgeEl.textContent = `${num} ${label}`;
    this.counterBadgeEl.classList.remove("hidden");
  }
}

/**
 * Convenience factory to create a HubToolbar instance.
 * @param {Object} options
 * @returns {HubToolbar}
 */
export function setupHubToolbar(options) {
  return new HubToolbar(options);
}
