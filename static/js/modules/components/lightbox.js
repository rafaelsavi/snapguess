/**
 * Photo Lightbox Component for Immich Quiz.
 *
 * Provides a modal fullscreen photo preview with escape key dismissal,
 * click-outside-to-dismiss, and accessibility attributes.
 */

import { t } from "../i18n.js";

let _currentPhotos = null;
let _currentIndex = 0;
let _onIndexChange = null;

function updateLightboxView(transitionDirection = null) {
  const lightbox = document.getElementById("photo-lightbox");
  if (!lightbox) return;

  const imgEl = document.getElementById("photo-lightbox-img");
  const prevBtn = lightbox.querySelector(".photo-lightbox-prev");
  const nextBtn = lightbox.querySelector(".photo-lightbox-next");
  const counterEl = lightbox.querySelector(".photo-lightbox-counter");

  if (_currentPhotos && _currentPhotos.length > 1) {
    if (imgEl) {
      imgEl.src = _currentPhotos[_currentIndex];
      if (transitionDirection) {
        const animClass = transitionDirection === "next" ? "photo-swipe-next" : "photo-swipe-prev";
        imgEl.classList.remove("photo-swipe-next", "photo-swipe-prev");
        void imgEl.offsetWidth;
        imgEl.classList.add(animClass);
        const onEnd = () => {
          imgEl.classList.remove(animClass);
          imgEl.removeEventListener("animationend", onEnd);
        };
        imgEl.addEventListener("animationend", onEnd, { once: true });
      }
    }
    if (prevBtn) {
      prevBtn.classList.remove("hidden");
      prevBtn.disabled = _currentIndex === 0;
    }
    if (nextBtn) {
      nextBtn.classList.remove("hidden");
      nextBtn.disabled = _currentIndex === _currentPhotos.length - 1;
    }
    if (counterEl) {
      counterEl.classList.remove("hidden");
      counterEl.textContent = `${_currentIndex + 1} / ${_currentPhotos.length}`;
    }
  } else {
    if (prevBtn) prevBtn.classList.add("hidden");
    if (nextBtn) nextBtn.classList.add("hidden");
    if (counterEl) counterEl.classList.add("hidden");
  }
}

function navigateLightbox(direction) {
  if (!_currentPhotos || _currentPhotos.length <= 1) return;

  if (direction === "next" && _currentIndex < _currentPhotos.length - 1) {
    _currentIndex++;
    updateLightboxView("next");
    if (typeof _onIndexChange === "function") {
      _onIndexChange(_currentIndex);
    }
  } else if (direction === "prev" && _currentIndex > 0) {
    _currentIndex--;
    updateLightboxView("prev");
    if (typeof _onIndexChange === "function") {
      _onIndexChange(_currentIndex);
    }
  }
}

/**
 * Open photo in fullscreen lightbox overlay.
 * @param {string} src Media image URL
 * @param {object} [options]
 * @param {Array<string>} [options.photos=null] Optional array of all photo URLs for gallery navigation
 * @param {number} [options.currentIndex=0] Active index in photos array
 * @param {Function} [options.onIndexChange=null] Callback (newIndex) when photo changes
 */
export function openPhotoLightbox(src, { photos = null, currentIndex = 0, onIndexChange = null } = {}) {
  let lightbox = document.getElementById("photo-lightbox");
  if (!lightbox) {
    lightbox = document.createElement("div");
    lightbox.id = "photo-lightbox";
    lightbox.className = "photo-lightbox-overlay";
    lightbox.innerHTML = `
      <div class="photo-lightbox-content">
        <button type="button" class="photo-lightbox-close" title="${t("game.close_btn")}" data-i18n-title="game.close_btn">&times;</button>
        <button type="button" class="photo-lightbox-nav photo-lightbox-prev hidden" title="${t("game.prev_photo")}" data-i18n-title="game.prev_photo" aria-label="${t("game.prev_photo")}">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <img id="photo-lightbox-img" src="" alt="${t("game.fullscreen_photo_alt")}" data-i18n-alt="game.fullscreen_photo_alt" />
        <button type="button" class="photo-lightbox-nav photo-lightbox-next hidden" title="${t("game.next_photo")}" data-i18n-title="game.next_photo" aria-label="${t("game.next_photo")}">&rsaquo;</button>
        <div class="photo-lightbox-counter hidden"></div>
      </div>
    `;
    document.body.appendChild(lightbox);

    const closeBtn = lightbox.querySelector(".photo-lightbox-close");
    closeBtn.addEventListener("click", () => lightbox.classList.remove("active"));
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) lightbox.classList.remove("active");
    });

    const prevBtn = lightbox.querySelector(".photo-lightbox-prev");
    const nextBtn = lightbox.querySelector(".photo-lightbox-next");

    if (prevBtn) {
      prevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigateLightbox("prev");
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigateLightbox("next");
      });
    }

    document.addEventListener("keydown", (e) => {
      if (!lightbox.classList.contains("active")) return;
      if (e.key === "Escape") {
        lightbox.classList.remove("active");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateLightbox("prev");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateLightbox("next");
      }
    });

    // Touch swipe gestures for mobile
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let touchStartTime = 0;
    let isTracking = false;

    lightbox.addEventListener("touchstart", (e) => {
      if (e.touches.length > 1 || (e.target && e.target.closest("button"))) {
        isTracking = false;
        return;
      }
      isTracking = true;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchEndX = touchStartX;
      touchEndY = touchStartY;
      touchStartTime = Date.now();
    }, { passive: true });

    lightbox.addEventListener("touchmove", (e) => {
      if (!isTracking || e.touches.length > 1) return;
      touchEndX = e.touches[0].clientX;
      touchEndY = e.touches[0].clientY;
    }, { passive: true });

    lightbox.addEventListener("touchend", (e) => {
      if (!isTracking) return;
      isTracking = false;

      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
      const deltaTime = Date.now() - touchStartTime;

      if (
        Math.abs(deltaX) >= 40 &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.25 &&
        deltaTime <= 700
      ) {
        if (deltaX < 0) {
          navigateLightbox("next");
        } else {
          navigateLightbox("prev");
        }
      }
    }, { passive: true });

    lightbox.addEventListener("touchcancel", () => {
      isTracking = false;
    }, { passive: true });
  }

  _currentPhotos = Array.isArray(photos) && photos.length > 1 ? photos : null;
  _currentIndex = _currentPhotos ? Math.max(0, Math.min(currentIndex, _currentPhotos.length - 1)) : 0;
  _onIndexChange = onIndexChange;

  const imgEl = document.getElementById("photo-lightbox-img");
  if (imgEl) {
    imgEl.src = _currentPhotos ? _currentPhotos[_currentIndex] : src;
  }

  updateLightboxView();
  lightbox.classList.add("active");
}

/**
 * Close fullscreen photo lightbox overlay if open.
 */
export function closePhotoLightbox() {
  const lightbox = document.getElementById("photo-lightbox");
  if (lightbox) {
    lightbox.classList.remove("active");
  }
}

/**
 * Check if fullscreen photo lightbox overlay is currently open.
 * @returns {boolean}
 */
export function isPhotoLightboxOpen() {
  const lightbox = document.getElementById("photo-lightbox");
  return Boolean(lightbox && lightbox.classList.contains("active"));
}
