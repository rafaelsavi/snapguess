import { t, tOr } from "../i18n.js";
import { challengeSession } from "../challenge/session.js";

export function showShareToast(message) {
  let toast = document.querySelector(".share-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "share-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
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
      ? `${window.location.origin}/play/${encodeURIComponent(capToken)}`
      : window.location.href;
    title = tOr("challenge.invite_message", "Immich Quiz Challenge");
    successMessage = tOr("challenge.link_copied", "Challenge link copied to clipboard!");
  } else {
    shareUrl = summary.match_id
      ? `${window.location.origin}/game/${encodeURIComponent(summary.match_id)}/replay`
      : window.location.href;
    title = tOr("summary.share_title", "Immich Quiz Results");
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
