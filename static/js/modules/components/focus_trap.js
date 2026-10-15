/**
 * Focus Trap Utility for Accessible Modal Dialogs.
 * Traps Tab / Shift+Tab keyboard navigation within the active modal dialog
 * and restores focus to the triggering element upon closure.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const _trapStack = [];

/**
 * Activate a focus trap on a container element.
 * Supports nesting: if a dialog opens on top of an existing modal,
 * the parent trap is paused and automatically resumed when the dialog closes.
 *
 * @param {HTMLElement} containerEl - The modal or dialog container.
 * @param {HTMLElement|null} [initialFocusEl] - Optional specific element to receive initial focus.
 */
export function activateFocusTrap(containerEl, initialFocusEl = null) {
  if (!containerEl) return;

  // Pause parent trap listener if any
  if (_trapStack.length > 0) {
    const parentTrap = _trapStack[_trapStack.length - 1];
    parentTrap.containerEl.removeEventListener('keydown', parentTrap.handleKeyDown);
  }

  const previouslyFocused = document.activeElement;

  function getFocusableElements() {
    return Array.from(containerEl.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0
    );
  }

  function handleKeyDown(event) {
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const firstEl = focusable[0];
    const lastEl = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === firstEl || !containerEl.contains(document.activeElement)) {
        event.preventDefault();
        lastEl.focus();
      }
    } else {
      if (document.activeElement === lastEl || !containerEl.contains(document.activeElement)) {
        event.preventDefault();
        firstEl.focus();
      }
    }
  }

  containerEl.addEventListener('keydown', handleKeyDown);

  // Set initial focus
  requestAnimationFrame(() => {
    if (initialFocusEl && containerEl.contains(initialFocusEl)) {
      initialFocusEl.focus();
    } else {
      const focusable = getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }
  });

  _trapStack.push({
    containerEl,
    handleKeyDown,
    previouslyFocused,
  });
}

/**
 * Deactivate the currently active focus trap (or specific container) and restore previous focus.
 * @param {HTMLElement|null} [targetContainerEl] - Optional specific container to remove from stack.
 */
export function deactivateFocusTrap(targetContainerEl = null) {
  if (_trapStack.length === 0) return;

  let trap = null;
  if (targetContainerEl) {
    const idx = _trapStack.findIndex((t) => t.containerEl === targetContainerEl);
    if (idx !== -1) {
      [trap] = _trapStack.splice(idx, 1);
    }
  }
  if (!trap) {
    trap = _trapStack.pop();
  }
  if (!trap) return;

  const { containerEl, handleKeyDown, previouslyFocused } = trap;
  containerEl.removeEventListener('keydown', handleKeyDown);

  if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    if (document.body.contains(previouslyFocused)) {
      previouslyFocused.focus();
    }
  }

  // Resume parent trap keydown listener if any
  if (_trapStack.length > 0) {
    const parentTrap = _trapStack[_trapStack.length - 1];
    parentTrap.containerEl.addEventListener('keydown', parentTrap.handleKeyDown);
  }
}
