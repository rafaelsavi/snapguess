/**
 * Accessible Application Dialog Component for SnapGuess.
 * Replaces native browser alert, confirm, and prompt dialogs with themed,
 * accessible, focus-trapped, and PWA-friendly website popups.
 */

import { t, registerAlertDialogHandler } from "../i18n.js";
import { activateFocusTrap, deactivateFocusTrap } from "./focus_trap.js";

let _modalEl = null;
let _titleEl = null;
let _iconEl = null;
let _messageEl = null;
let _promptWrapEl = null;
let _promptInputEl = null;
let _confirmBtn = null;
let _cancelBtn = null;
let _closeBtn = null;

let _currentResolver = null;
let _currentMode = null;
const _dialogQueue = [];

/**
 * Ensure dialog elements are cached and event listeners attached.
 */
export function initDialogModal() {
  if (_modalEl) return;

  _modalEl = document.getElementById("app-dialog-modal");
  if (!_modalEl) return;

  registerAlertDialogHandler((msg) => showAlertDialog({ message: msg }));

  _titleEl = document.getElementById("app-dialog-title");
  _iconEl = document.getElementById("app-dialog-icon");
  _messageEl = document.getElementById("app-dialog-message");
  _promptWrapEl = document.getElementById("app-dialog-prompt-wrap");
  _promptInputEl = document.getElementById("app-dialog-prompt-input");
  _confirmBtn = document.getElementById("app-dialog-confirm-btn");
  _cancelBtn = document.getElementById("app-dialog-cancel-btn");
  _closeBtn = document.getElementById("app-dialog-close-btn");

  if (_confirmBtn) {
    _confirmBtn.addEventListener("click", () => {
      if (_currentMode === "prompt") {
        const val = _promptInputEl ? _promptInputEl.value : "";
        closeDialog(val);
      } else {
        closeDialog(true);
      }
    });
  }

  if (_cancelBtn) {
    _cancelBtn.addEventListener("click", () => {
      closeDialog(_currentMode === "prompt" ? null : false);
    });
  }

  if (_closeBtn) {
    _closeBtn.addEventListener("click", () => {
      closeDialog(_currentMode === "prompt" ? null : false);
    });
  }

  if (_promptInputEl) {
    _promptInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        closeDialog(_promptInputEl.value);
      }
    });
  }

  // Close on backdrop pointerdown+click (guards against dragging text out of modal)
  let _isBackdropPress = false;
  _modalEl.addEventListener("pointerdown", (e) => {
    _isBackdropPress = (e.target === _modalEl);
  });
  _modalEl.addEventListener("click", (e) => {
    if (_isBackdropPress && e.target === _modalEl) {
      closeDialog(_currentMode === "prompt" ? null : false);
    }
    _isBackdropPress = false;
  });

  // Global Escape key dismiss
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && _modalEl && !_modalEl.classList.contains("hidden")) {
      e.preventDefault();
      closeDialog(_currentMode === "prompt" ? null : false);
    }
  });
}

function closeDialog(result) {
  if (!_modalEl || _modalEl.classList.contains("hidden")) return;

  deactivateFocusTrap();
  _modalEl.classList.add("hidden");
  _modalEl.setAttribute("aria-hidden", "true");

  if (_currentResolver) {
    const resolver = _currentResolver;
    _currentResolver = null;
    _currentMode = null;
    resolver(result);
  }

  // Process next dialog in queue if any
  if (_dialogQueue.length > 0) {
    const nextTask = _dialogQueue.shift();
    setTimeout(() => {
      nextTask();
    }, 50);
  }
}

function applyIcon(iconType) {
  if (!_iconEl) return;
  _iconEl.className = "dialog-title-icon";

  switch (iconType) {
    case "danger":
    case "error":
      _iconEl.textContent = "⚠️";
      _iconEl.classList.add("icon-danger");
      break;
    case "warning":
      _iconEl.textContent = "⚠️";
      _iconEl.classList.add("icon-warning");
      break;
    case "success":
      _iconEl.textContent = "✓";
      _iconEl.classList.add("icon-success");
      break;
    case "prompt":
      _iconEl.textContent = "✏️";
      _iconEl.classList.add("icon-info");
      break;
    case "info":
    default:
      _iconEl.textContent = "ℹ️";
      _iconEl.classList.add("icon-info");
      break;
  }
}

/**
 * Show a confirmation dialog (Confirm vs. Cancel).
 * @param {Object} options
 * @param {string} [options.title] - Dialog title.
 * @param {string} options.message - Confirmation prompt message.
 * @param {string} [options.confirmText] - Label for confirm button.
 * @param {string} [options.cancelText] - Label for cancel button.
 * @param {boolean} [options.isDanger=false] - Whether confirm button triggers a destructive action.
 * @param {string} [options.icon="warning"] - "warning" | "danger" | "info" | "success"
 * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled/dismissed.
 */
export function showConfirmDialog({
  title = null,
  message = "",
  confirmText = null,
  cancelText = null,
  isDanger = false,
  icon = null,
} = {}) {
  initDialogModal();
  if (!_modalEl) return Promise.resolve(false);

  if (_currentResolver) {
    return new Promise((resolve) => {
      _dialogQueue.push(() => {
        showConfirmDialog({ title, message, confirmText, cancelText, isDanger, icon }).then(resolve);
      });
    });
  }

  return new Promise((resolve) => {
    _currentResolver = resolve;
    _currentMode = "confirm";

    const resolvedTitle = title || t("dialog.confirm_title");
    const resolvedConfirm = confirmText || (isDanger ? t("common.confirm") : t("common.ok"));
    const resolvedCancel = cancelText || t("common.cancel");
    const resolvedIcon = icon || (isDanger ? "danger" : "warning");

    _titleEl.textContent = resolvedTitle;
    _messageEl.textContent = message;
    applyIcon(resolvedIcon);

    _confirmBtn.textContent = resolvedConfirm;
    _confirmBtn.classList.remove("hidden");
    _confirmBtn.className = isDanger ? "btn-danger" : "btn-primary";

    _cancelBtn.textContent = resolvedCancel;
    _cancelBtn.classList.remove("hidden");

    _promptWrapEl.classList.add("hidden");

    _modalEl.classList.remove("hidden");
    _modalEl.setAttribute("aria-hidden", "false");

    // Focus safe button first (cancel button if destructive, confirm button otherwise)
    const initialFocus = isDanger ? _cancelBtn : _confirmBtn;
    activateFocusTrap(_modalEl, initialFocus);
  });
}

/**
 * Show an alert notice dialog (OK button only).
 * @param {Object|string} options - Dialog options or plain message string.
 * @param {string} [options.title] - Dialog title.
 * @param {string} [options.message] - Alert message text.
 * @param {string} [options.okText] - OK button label.
 * @param {string} [options.icon="info"] - Icon style ("info" | "error" | "warning" | "success").
 * @returns {Promise<void>} Resolves when dismissed.
 */
export function showAlertDialog(options) {
  initDialogModal();
  if (!_modalEl) return Promise.resolve();

  const opts = typeof options === "string" ? { message: options } : (options || {});
  const {
    title = null,
    message = "",
    okText = null,
    icon = null,
  } = opts;

  if (_currentResolver) {
    return new Promise((resolve) => {
      _dialogQueue.push(() => {
        showAlertDialog(opts).then(resolve);
      });
    });
  }

  return new Promise((resolve) => {
    _currentResolver = () => resolve();
    _currentMode = "alert";

    const isError = icon === "error" || /error|fail|falha|erro/i.test(message);
    const resolvedTitle = title || (isError ? t("dialog.error_title") : t("dialog.alert_title"));
    const resolvedOk = okText || t("common.ok");
    const resolvedIcon = icon || (isError ? "error" : "info");

    _titleEl.textContent = resolvedTitle;
    _messageEl.textContent = message;
    applyIcon(resolvedIcon);

    _confirmBtn.textContent = resolvedOk;
    _confirmBtn.classList.remove("hidden");
    _confirmBtn.className = isError ? "btn-danger" : "btn-primary";

    _cancelBtn.classList.add("hidden");
    _promptWrapEl.classList.add("hidden");

    _modalEl.classList.remove("hidden");
    _modalEl.setAttribute("aria-hidden", "false");

    activateFocusTrap(_modalEl, _confirmBtn);
  });
}

/**
 * Show a prompt dialog for text input.
 * @param {Object} options
 * @param {string} [options.title] - Dialog title.
 * @param {string} options.message - Prompt explanation message.
 * @param {string} [options.defaultValue=""] - Initial text value.
 * @param {string} [options.placeholder=""] - Input placeholder text.
 * @param {string} [options.confirmText] - Confirm button label.
 * @param {string} [options.cancelText] - Cancel button label.
 * @returns {Promise<string|null>} Resolves to entered text on confirm, or null on cancel.
 */
export function showPromptDialog({
  title = null,
  message = "",
  defaultValue = "",
  placeholder = "",
  confirmText = null,
  cancelText = null,
} = {}) {
  initDialogModal();
  if (!_modalEl) return Promise.resolve(null);

  if (_currentResolver) {
    return new Promise((resolve) => {
      _dialogQueue.push(() => {
        showPromptDialog({ title, message, defaultValue, placeholder, confirmText, cancelText }).then(resolve);
      });
    });
  }

  return new Promise((resolve) => {
    _currentResolver = resolve;
    _currentMode = "prompt";

    const resolvedTitle = title || t("dialog.prompt_title");
    const resolvedConfirm = confirmText || t("common.ok");
    const resolvedCancel = cancelText || t("common.cancel");

    _titleEl.textContent = resolvedTitle;
    _messageEl.textContent = message;
    applyIcon("prompt");

    _promptWrapEl.classList.remove("hidden");
    if (_promptInputEl) {
      _promptInputEl.value = defaultValue;
      _promptInputEl.placeholder = placeholder;
    }

    _confirmBtn.textContent = resolvedConfirm;
    _confirmBtn.classList.remove("hidden");
    _confirmBtn.className = "btn-primary";

    _cancelBtn.textContent = resolvedCancel;
    _cancelBtn.classList.remove("hidden");

    _modalEl.classList.remove("hidden");
    _modalEl.setAttribute("aria-hidden", "false");

    activateFocusTrap(_modalEl, _promptInputEl);
    if (_promptInputEl) {
      _promptInputEl.focus();
      _promptInputEl.select();
    }
  });
}
