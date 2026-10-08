import { t, tOr } from "../i18n.js";
import { challengeSession } from "../challenge/session.js";
import { escapeHtml } from "../formatters.js";

export function showShareToast(message) {
  let toast = document.querySelector(".share-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "share-toast";
    document.body.appendChild(toast);
  }
  const isError = /fail|error|erro|falha/i.test(message);
  const iconSvg = isError
    ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f87171" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
    : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2dd4bf" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  toast.innerHTML = `<span class="share-toast-icon">${iconSvg}</span><span class="share-toast-text">${escapeHtml(message)}</span>`;
  toast.classList.add("show");
  if (toast._timer) {
    clearTimeout(toast._timer);
  }
  toast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

/**
 * Safely copy text to clipboard with fallback and optional button/toast feedback.
 * @param {string} text - Text to copy.
 * @param {Object} [options]
 * @param {HTMLElement} [options.button] - Button element to animate feedback on.
 * @param {string} [options.copiedText] - Text to show on button when copied.
 * @param {string} [options.copiedHtml] - HTML string to show on button when copied.
 * @param {string} [options.successMessage] - Toast message to show on copy.
 * @param {number} [options.resetTimeoutMs=2500] - Duration before reverting button state.
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text, options = {}) {
  const { button, copiedText, copiedHtml, successMessage, resetTimeoutMs = 2500 } = options;
  let success = false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      success = true;
    } else {
      throw new Error("Clipboard API unavailable");
    }
  } catch (_) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      textarea.setAttribute("readonly", "");
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      success = document.execCommand("copy");
      document.body.removeChild(textarea);
    } catch (fallbackErr) {
      console.warn("Clipboard copy failed:", fallbackErr);
      success = false;
    }
  }

  if (success) {
    if (button) {
      button.classList.add("copied");
      const originalHtml = button.innerHTML;
      if (copiedHtml) {
        button.innerHTML = copiedHtml;
      } else if (copiedText) {
        button.textContent = copiedText;
      }
      setTimeout(() => {
        button.classList.remove("copied");
        if (copiedHtml || copiedText) {
          button.innerHTML = originalHtml;
        }
      }, resetTimeoutMs);
    }
    if (successMessage) {
      showShareToast(successMessage);
    }
  } else {
    showShareToast(tOr("summary.share_failed", "Failed to copy to clipboard"));
  }

  return success;
}

export async function shareMatchSummary(summary) {
  if (!summary) return;

  const isChallenge = Boolean(
    summary.is_challenge ||
    summary.play_mode === "challenge" ||
    summary.challenge_id ||
    summary.capability_token ||
    challengeSession?.challengeData?.capability_token
  );

  let shareUrl;
  let title;
  let successMessage;

  if (isChallenge) {
    const capToken =
      summary.capability_token ||
      challengeSession?.challengeData?.capability_token;
    shareUrl = capToken
      ? `${window.location.origin}/play/${encodeURIComponent(capToken)}/summary`
      : window.location.href;
    title = tOr("summary.share_title", "SnapGuess Results");
    successMessage = tOr("summary.share_copied", "Replay link copied to clipboard!");
  } else {
    shareUrl = summary.match_id
      ? `${window.location.origin}/game/${encodeURIComponent(summary.match_id)}/replay`
      : window.location.href;
    title = tOr("summary.share_title", "SnapGuess Results");
    successMessage = tOr("summary.share_copied", "Replay link copied to clipboard!");
  }

  try {
    if (navigator.share && navigator.canShare && navigator.canShare({ url: shareUrl })) {
      await navigator.share({ title, url: shareUrl });
    } else {
      await copyToClipboard(shareUrl, { successMessage });
    }
  } catch (err) {
    if (err && err.name !== "AbortError") {
      await copyToClipboard(shareUrl, { successMessage });
    }
  }
}
