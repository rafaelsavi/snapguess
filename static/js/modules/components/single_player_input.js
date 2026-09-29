/**
 * Single Player / Creator Name Input Component
 * Manages prefill waterfall, avatar initial preview, locked identity badge,
 * whitespace normalization, autocomplete, and local persistence.
 */
import { state } from "../state.js";
import { playerInitial, playerColor, resolvePlayerName } from "../formatters.js";
import { attachPlayerAutocomplete } from "./player_autocomplete.js";

export const CREATOR_NAME_STORAGE_KEY = "immich_challenge_creator_name";

export class SinglePlayerInput {
  /**
   * @param {Object} options
   * @param {HTMLInputElement} options.input - Target text input
   * @param {HTMLElement} [options.avatarPreview] - Avatar element to show player initial
   * @param {HTMLElement} [options.lockedBadge] - Badge element to toggle when identity is locked
   * @param {string} [options.storageKey] - Key for localStorage persistence
   * @param {function(): string} [options.getFallback] - Fallback supplier if no auth/storage name
   * @param {function(string): void} [options.onChange] - Callback on change/input
   * @param {boolean} [options.enableAutocomplete=true] - Attach player autocomplete
   */
  constructor(options = {}) {
    this.input = options.input;
    if (!this.input) return;

    this.avatarPreview = options.avatarPreview || null;
    this.lockedBadge = options.lockedBadge || null;
    this.storageKey = options.storageKey || null;
    this.getFallback = options.getFallback || (() => "");
    this.onChange = options.onChange || null;
    this.enableAutocomplete = options.enableAutocomplete !== false;
    this.autocomplete = null;

    this._init();
  }

  _init() {
    this._bindEvents();
    this.syncFromAuth();
  }

  _bindEvents() {
    this.input.addEventListener("input", () => {
      this._updateAvatar();
      if (this.onChange) this.onChange(this.getValue());
    });

    this.input.addEventListener("change", () => {
      this._sanitize();
      this._updateAvatar();
      if (this.storageKey) this.save();
      if (this.onChange) this.onChange(this.getValue());
    });

    this.input.addEventListener("blur", () => {
      this._sanitize();
      this._updateAvatar();
      if (this.storageKey) this.save();
    });

    if (this.enableAutocomplete) {
      this.autocomplete = attachPlayerAutocomplete(this.input, {
        onSelect: (name) => {
          this.setValue(name);
          if (this.storageKey) this.save();
          if (this.onChange) this.onChange(this.getValue());
        },
      });
    }
  }

  /**
   * Synchronize input value and locked state from auth context.
   * @param {boolean} [force=false] - Force overwrite input value even if already populated
   */
  syncFromAuth(force = false) {
    const isLocked = Boolean(state.auth?.lock_player_name && state.auth?.name);

    if (isLocked) {
      this.input.value = (state.auth?.name || "").trim();
      this.input.readOnly = true;
      if (this.lockedBadge) {
        this.lockedBadge.classList.remove("hidden");
      }
      this.autocomplete?.close();
    } else {
      this.input.readOnly = false;
      if (this.lockedBadge) {
        this.lockedBadge.classList.add("hidden");
      }
      // If empty or force, prefill default name
      if (!this.input.value.trim() || force) {
        const def = resolvePlayerName(this.storageKey, this.getFallback);
        if (def) {
          this.input.value = def;
        }
      }
    }

    this._sanitize();
    this._updateAvatar();
  }

  _sanitize() {
    if (this.input.value) {
      this.input.value = this.input.value.trim().replace(/\s+/g, " ");
    }
  }

  _updateAvatar() {
    if (!this.avatarPreview) return;
    const val = this.getValue();
    this.avatarPreview.textContent = val ? playerInitial(val) : "?";
    if (val) {
      this.avatarPreview.style.background = playerColor(val);
    }
    const isAuth = Boolean(
      state.auth?.name &&
      val &&
      val.toLowerCase() === state.auth.name.trim().toLowerCase()
    );
    this.avatarPreview.classList.toggle("is-auth", isAuth);
    this.avatarPreview.classList.toggle("user-gold-avatar", isAuth);
  }

  getValue() {
    return (this.input.value || "").trim().replace(/\s+/g, " ");
  }

  setValue(val) {
    this.input.value = (val || "").trim().replace(/\s+/g, " ");
    this._updateAvatar();
    this.input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  save() {
    if (!this.storageKey) return;
    const val = this.getValue();
    try {
      if (val) {
        localStorage.setItem(this.storageKey, val);
      }
    } catch (_) {}
  }

  focus() {
    this.input.focus();
  }
}
