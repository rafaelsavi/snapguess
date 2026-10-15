/**
 * PWA Installation Controller
 * Manages native install prompts for Android/Chromium, custom bottom banner,
 * header install action button, and step-by-step installation instructions for iOS.
 */

import { activateFocusTrap, deactivateFocusTrap } from "./focus_trap.js";

const DISMISS_KEY = "snapguess_pwa_dismissed";
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

let _deferredPrompt = null;
let _initialized = false;
let _headerBtn = null;
let _bannerEl = null;
let _bannerInstallBtn = null;
let _bannerDismissBtn = null;
let _iosModalEl = null;
let _iosCloseBtn = null;
let _iosGotItBtn = null;

/**
 * Returns true if running as a standalone PWA or full-screen web app.
 */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true
  );
}

/**
 * Returns true if the client device is iOS / iPadOS.
 */
export function isIOS() {
  if (typeof window === "undefined" || !window.navigator) return false;
  const ua = window.navigator.userAgent || "";
  const isApple = /iPad|iPhone|iPod/.test(ua);
  const isMacTouch =
    window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
  return isApple || isMacTouch;
}

/**
 * Returns true if running on a mobile viewport or mobile device.
 */
export function isMobile() {
  if (typeof window === "undefined") return false;
  return (
    window.innerWidth <= 768 ||
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
  );
}

/**
 * Checks whether the user has dismissed the install banner recently.
 */
function isBannerDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = parseInt(raw, 10);
    return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
  } catch (_) {
    return false;
  }
}

/**
 * Marks the banner as dismissed in localStorage.
 */
function recordBannerDismissal() {
  try {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  } catch (_) {}
}

/**
 * Shows the header install button.
 */
function showHeaderButton() {
  if (_headerBtn && !isStandalone()) {
    _headerBtn.classList.remove("hidden");
  }
}

/**
 * Hides the header install button.
 */
function hideHeaderButton() {
  if (_headerBtn) {
    _headerBtn.classList.add("hidden");
  }
}

/**
 * Shows the mobile bottom banner with entrance animation.
 */
export function showInstallBanner() {
  if (!_bannerEl || isStandalone() || isBannerDismissed() || !isMobile()) {
    return;
  }
  if (document.documentElement.classList.contains("game-mode-active")) {
    return;
  }
  _bannerEl.classList.remove("hidden", "exiting");
}

/**
 * Hides the mobile bottom banner with exit animation.
 */
export function dismissInstallBanner(persist = true) {
  if (!_bannerEl || _bannerEl.classList.contains("hidden")) return;
  if (persist) {
    recordBannerDismissal();
  }
  _bannerEl.classList.add("exiting");
  setTimeout(() => {
    _bannerEl.classList.add("hidden");
    _bannerEl.classList.remove("exiting");
  }, 250);
}

/**
 * Opens the iOS install guidance modal.
 */
export function openIosInstallModal() {
  if (!_iosModalEl) return;
  _iosModalEl.classList.remove("hidden");
  _iosModalEl.setAttribute("aria-hidden", "false");
  activateFocusTrap(_iosModalEl);
}

/**
 * Closes the iOS install guidance modal.
 */
export function closeIosInstallModal() {
  if (!_iosModalEl) return;
  _iosModalEl.classList.add("hidden");
  _iosModalEl.setAttribute("aria-hidden", "true");
  deactivateFocusTrap(_iosModalEl);
}

/**
 * Handles the user install action from either the header button or bottom banner.
 */
export async function triggerInstall() {
  if (_deferredPrompt) {
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if (outcome === "accepted") {
      dismissInstallBanner(false);
      hideHeaderButton();
    }
    _deferredPrompt = null;
    return;
  }

  if (isIOS()) {
    openIosInstallModal();
    return;
  }

  // Fallback: If no deferred prompt is held (e.g. desktop non-Chrome or already prompted), show iOS guide or dismiss banner
  openIosInstallModal();
}

/**
 * Initializes the PWA install controller and hooks up browser events.
 */
export function initPwaInstall() {
  if (_initialized || typeof window === "undefined") return;
  _initialized = true;

  _headerBtn = document.getElementById("pwa-install-btn");
  _bannerEl = document.getElementById("pwa-install-banner");
  _bannerInstallBtn = document.getElementById("pwa-banner-install-btn");
  _bannerDismissBtn = document.getElementById("pwa-banner-dismiss-btn");
  _iosModalEl = document.getElementById("pwa-ios-modal");
  _iosCloseBtn = document.getElementById("pwa-ios-modal-close-btn");
  _iosGotItBtn = document.getElementById("pwa-ios-gotit-btn");

  if (isStandalone()) {
    hideHeaderButton();
    if (_bannerEl) _bannerEl.classList.add("hidden");
    return;
  }

  // Hook up button clicks
  if (_headerBtn) {
    _headerBtn.addEventListener("click", triggerInstall);
  }

  if (_bannerInstallBtn) {
    _bannerInstallBtn.addEventListener("click", triggerInstall);
  }

  if (_bannerDismissBtn) {
    _bannerDismissBtn.addEventListener("click", () => dismissInstallBanner(true));
  }

  // iOS Modal dismissal handlers
  if (_iosCloseBtn) {
    _iosCloseBtn.addEventListener("click", closeIosInstallModal);
  }

  if (_iosGotItBtn) {
    _iosGotItBtn.addEventListener("click", closeIosInstallModal);
  }

  // Backdrop click dismiss for iOS modal
  if (_iosModalEl) {
    let isBackdropPress = false;
    _iosModalEl.addEventListener("pointerdown", (e) => {
      isBackdropPress = e.target === _iosModalEl;
    });
    _iosModalEl.addEventListener("click", (e) => {
      if (isBackdropPress && e.target === _iosModalEl) {
        closeIosInstallModal();
      }
      isBackdropPress = false;
    });
  }

  // Escape key closes modal
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      _iosModalEl &&
      !_iosModalEl.classList.contains("hidden")
    ) {
      closeIosInstallModal();
    }
  });

  // Native beforeinstallprompt handling for Android / Chromium browsers
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    showHeaderButton();

    // Show mobile banner after a gentle delay
    if (isMobile() && !isBannerDismissed()) {
      setTimeout(() => {
        showInstallBanner();
      }, 3000);
    }
  });

  // Native appinstalled event handling
  window.addEventListener("appinstalled", () => {
    _deferredPrompt = null;
    hideHeaderButton();
    dismissInstallBanner(false);
  });

  // iOS handling: if iOS and not in standalone mode, enable install button and banner
  if (isIOS() && !isStandalone()) {
    showHeaderButton();

    if (isMobile() && !isBannerDismissed()) {
      setTimeout(() => {
        showInstallBanner();
      }, 4000);
    }
  }
}
