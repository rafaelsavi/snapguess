/**
 * Photo Lightbox Component for SnapGuess.
 *
 * Provides a modal fullscreen photo preview with mobile pinch-to-zoom,
 * double-tap to zoom, drag-to-pan, escape key dismissal,
 * click-outside-to-dismiss, and accessibility attributes.
 */

import { t } from "../i18n.js";

let _currentPhotos = null;
let _currentIndex = 0;
let _onIndexChange = null;

let _scale = 1;
let _translateX = 0;
let _translateY = 0;

function _getBounds(scale) {
  const imgEl = document.getElementById("photo-lightbox-img");
  if (!imgEl) return { maxTx: 0, maxTy: 0 };
  const baseW = imgEl.offsetWidth || 300;
  const baseH = imgEl.offsetHeight || 300;
  const scaledW = baseW * scale;
  const scaledH = baseH * scale;
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const maxTx = scaledW > viewW ? (scaledW - viewW) / 2 + 16 : 0;
  const maxTy = scaledH > viewH ? (scaledH - viewH) / 2 + 16 : 0;
  return { maxTx, maxTy };
}

function _clampTranslations(scale, tx, ty) {
  const { maxTx, maxTy } = _getBounds(scale);
  return {
    x: Math.max(-maxTx, Math.min(maxTx, tx)),
    y: Math.max(-maxTy, Math.min(maxTy, ty)),
  };
}

function _applyTransform(scale, tx, ty, animate = false) {
  const imgEl = document.getElementById("photo-lightbox-img");
  const lightbox = document.getElementById("photo-lightbox");
  if (!imgEl || !lightbox) return;

  _scale = scale;
  _translateX = tx;
  _translateY = ty;
  const isZoomed = _scale > 1.05;

  if (animate) {
    imgEl.style.transition = "transform 0.25s cubic-bezier(0.2, 0, 0.2, 1)";
    const onEnd = () => {
      imgEl.style.transition = "";
      imgEl.removeEventListener("transitionend", onEnd);
    };
    imgEl.addEventListener("transitionend", onEnd, { once: true });
  } else {
    imgEl.style.transition = "none";
  }

  imgEl.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
  lightbox.classList.toggle("is-zoomed", isZoomed);

  const resetBtn = lightbox.querySelector(".photo-lightbox-zoom-reset");
  const resetLabel = lightbox.querySelector(".photo-lightbox-zoom-label");
  if (resetBtn) {
    resetBtn.classList.toggle("hidden", !isZoomed);
    if (resetLabel) {
      resetLabel.textContent = `${scale.toFixed(1)}x`;
    }
  }
}

function _zoomToPoint(targetScale, clientX, clientY) {
  const imgEl = document.getElementById("photo-lightbox-img");
  if (!imgEl) return;
  const rect = imgEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const offsetX = clientX - centerX;
  const offsetY = clientY - centerY;
  const targetTx = -offsetX * (targetScale - 1);
  const targetTy = -offsetY * (targetScale - 1);
  const clamped = _clampTranslations(targetScale, targetTx, targetTy);
  _applyTransform(targetScale, clamped.x, clamped.y, true);
}

/**
 * Reset photo zoom to 1.0x scale and centered position.
 * @param {boolean} [animate=true]
 */
export function resetLightboxZoom(animate = true) {
  _applyTransform(1, 0, 0, animate);
}

/**
 * Current photo zoom scale (>= 1.0).
 * @returns {number}
 */
export function getLightboxScale() {
  return _scale;
}

function updateLightboxView(transitionDirection = null) {
  const lightbox = document.getElementById("photo-lightbox");
  if (!lightbox) return;

  resetLightboxZoom(false);

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

  resetLightboxZoom(false);

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
        <button type="button" class="photo-lightbox-zoom-reset hidden" title="${t("game.reset_zoom")}" data-i18n-title="game.reset_zoom" aria-label="${t("game.reset_zoom")}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
          <span class="photo-lightbox-zoom-label">1.0x</span>
        </button>
        <button type="button" class="photo-lightbox-close" title="${t("game.close_btn")}" data-i18n-title="game.close_btn">&times;</button>
        <button type="button" class="photo-lightbox-nav photo-lightbox-prev hidden" title="${t("game.prev_photo")}" data-i18n-title="game.prev_photo" aria-label="${t("game.prev_photo")}">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <img id="photo-lightbox-img" src="" alt="${t("game.fullscreen_photo_alt")}" data-i18n-alt="game.fullscreen_photo_alt" />
        <button type="button" class="photo-lightbox-nav photo-lightbox-next hidden" title="${t("game.next_photo")}" data-i18n-title="game.next_photo" aria-label="${t("game.next_photo")}">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
        <div class="photo-lightbox-counter hidden"></div>
      </div>
    `;
    document.body.appendChild(lightbox);

    const closeBtn = lightbox.querySelector(".photo-lightbox-close");
    closeBtn.addEventListener("click", () => closePhotoLightbox());

    const resetBtn = lightbox.querySelector(".photo-lightbox-zoom-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        resetLightboxZoom(true);
      });
    }

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
        e.stopImmediatePropagation();
        if (_scale > 1.05) {
          resetLightboxZoom(true);
        } else {
          closePhotoLightbox();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopImmediatePropagation();
        navigateLightbox("prev");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopImmediatePropagation();
        navigateLightbox("next");
      }
    });

    // Touch gesture tracking for mobile pinch-to-zoom, pan, and swipe
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let touchStartTime = 0;
    let touchLastX = 0;
    let touchLastY = 0;
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    let isTrackingSwipe = false;
    let isDragging = false;
    let isPinching = false;
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let pinchStartTx = 0;
    let pinchStartTy = 0;
    let pinchStartCenter = { x: 0, y: 0 };
    let hasMovedSignificant = false;

    lightbox.addEventListener(
      "touchstart",
      (e) => {
        if (e.target && e.target.closest("button")) {
          isTrackingSwipe = false;
          isDragging = false;
          isPinching = false;
          return;
        }

        if (e.touches.length === 2) {
          // Multi-touch pinch zoom
          isPinching = true;
          isTrackingSwipe = false;
          isDragging = false;
          hasMovedSignificant = true;
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          pinchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          pinchStartScale = _scale;
          pinchStartTx = _translateX;
          pinchStartTy = _translateY;
          pinchStartCenter = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
          if (e.cancelable) e.preventDefault();
          return;
        }

        if (e.touches.length === 1) {
          const touch = e.touches[0];
          const now = Date.now();
          const distFromLastTap = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);

          if (now - lastTapTime < 320 && distFromLastTap < 35) {
            // Double-tap detected: toggle quick zoom centered on tap point
            if (e.cancelable) e.preventDefault();
            lastTapTime = 0;
            isTrackingSwipe = false;
            isDragging = false;
            hasMovedSignificant = true;
            if (_scale > 1.05) {
              resetLightboxZoom(true);
            } else {
              _zoomToPoint(2.5, touch.clientX, touch.clientY);
            }
            return;
          }

          lastTapTime = now;
          lastTapX = touch.clientX;
          lastTapY = touch.clientY;
          touchStartX = touch.clientX;
          touchStartY = touch.clientY;
          touchLastX = touchStartX;
          touchLastY = touchStartY;
          touchEndX = touchStartX;
          touchEndY = touchStartY;
          touchStartTime = now;
          hasMovedSignificant = false;

          if (_scale > 1.05) {
            isDragging = true;
            isTrackingSwipe = false;
          } else {
            isTrackingSwipe = true;
            isDragging = false;
          }
        }
      },
      { passive: false }
    );

    lightbox.addEventListener(
      "touchmove",
      (e) => {
        if (isPinching && e.touches.length === 2) {
          if (e.cancelable) e.preventDefault();
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          if (pinchStartDist > 0) {
            const ratio = dist / pinchStartDist;
            const nextScale = Math.max(0.8, Math.min(pinchStartScale * ratio, 4.5));
            const curCenter = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
            const diffX = curCenter.x - pinchStartCenter.x;
            const diffY = curCenter.y - pinchStartCenter.y;
            _applyTransform(nextScale, pinchStartTx + diffX, pinchStartTy + diffY, false);
          }
          return;
        }

        if (e.touches.length === 1) {
          const touch = e.touches[0];
          const dx = touch.clientX - touchLastX;
          const dy = touch.clientY - touchLastY;

          if (Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY) > 8) {
            hasMovedSignificant = true;
          }

          if (isDragging && _scale > 1.05) {
            if (e.cancelable) e.preventDefault();
            touchLastX = touch.clientX;
            touchLastY = touch.clientY;
            const nextTx = _translateX + dx;
            const nextTy = _translateY + dy;
            const clamped = _clampTranslations(_scale, nextTx, nextTy);
            _applyTransform(_scale, clamped.x, clamped.y, false);
          } else if (isTrackingSwipe && _scale <= 1.05) {
            touchEndX = touch.clientX;
            touchEndY = touch.clientY;
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            if (Math.abs(deltaX) > Math.abs(deltaY) * 1.25 && Math.abs(deltaX) > 10) {
              if (e.cancelable) e.preventDefault();
            }
          }
        }
      },
      { passive: false }
    );

    const handleTouchEnd = (e) => {
      if (isPinching) {
        if (e.touches.length === 1) {
          isPinching = false;
          if (_scale > 1.05) {
            isDragging = true;
            touchLastX = e.touches[0].clientX;
            touchLastY = e.touches[0].clientY;
          }
          return;
        }
        if (e.touches.length === 0) {
          isPinching = false;
          if (_scale <= 1.05) {
            resetLightboxZoom(true);
          } else {
            const finalScale = Math.min(_scale, 4.0);
            const clamped = _clampTranslations(finalScale, _translateX, _translateY);
            _applyTransform(finalScale, clamped.x, clamped.y, true);
          }
          return;
        }
      }

      if (isDragging) {
        isDragging = false;
        if (_scale <= 1.05) {
          resetLightboxZoom(true);
        } else {
          const clamped = _clampTranslations(_scale, _translateX, _translateY);
          _applyTransform(_scale, clamped.x, clamped.y, true);
        }
      } else if (isTrackingSwipe && _scale <= 1.05) {
        isTrackingSwipe = false;
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
      }
    };

    lightbox.addEventListener("touchend", handleTouchEnd, { passive: false });
    lightbox.addEventListener(
      "touchcancel",
      () => {
        isPinching = false;
        isDragging = false;
        isTrackingSwipe = false;
        if (_scale <= 1.05) {
          resetLightboxZoom(true);
        } else {
          const clamped = _clampTranslations(_scale, _translateX, _translateY);
          _applyTransform(_scale, clamped.x, clamped.y, true);
        }
      },
      { passive: false }
    );

    // Desktop mouse wheel zoom
    lightbox.addEventListener(
      "wheel",
      (e) => {
        if (!lightbox.classList.contains("active")) return;
        if (e.cancelable) e.preventDefault();
        const delta = e.deltaY < 0 ? 0.35 : -0.35;
        const nextScale = Math.max(1, Math.min(_scale + delta, 4.0));
        if (nextScale <= 1.05) {
          resetLightboxZoom(true);
        } else {
          const clamped = _clampTranslations(nextScale, _translateX, _translateY);
          _applyTransform(nextScale, clamped.x, clamped.y, true);
        }
      },
      { passive: false }
    );

    // Desktop mouse drag
    let isMouseDown = false;
    let mouseLastX = 0;
    let mouseLastY = 0;
    const imgEl = document.getElementById("photo-lightbox-img");

    if (imgEl) {
      imgEl.addEventListener("mousedown", (e) => {
        if (_scale <= 1.05 || e.button !== 0) return;
        isMouseDown = true;
        mouseLastX = e.clientX;
        mouseLastY = e.clientY;
        imgEl.classList.add("is-dragging");
        e.preventDefault();
      });

      imgEl.addEventListener("dblclick", (e) => {
        e.preventDefault();
        hasMovedSignificant = true;
        if (_scale > 1.05) {
          resetLightboxZoom(true);
        } else {
          _zoomToPoint(2.5, e.clientX, e.clientY);
        }
      });
    }

    window.addEventListener("mousemove", (e) => {
      if (!isMouseDown) return;
      const dx = e.clientX - mouseLastX;
      const dy = e.clientY - mouseLastY;
      mouseLastX = e.clientX;
      mouseLastY = e.clientY;
      hasMovedSignificant = true;
      const clamped = _clampTranslations(_scale, _translateX + dx, _translateY + dy);
      _applyTransform(_scale, clamped.x, clamped.y, false);
    });

    window.addEventListener("mouseup", () => {
      if (!isMouseDown) return;
      isMouseDown = false;
      if (imgEl) imgEl.classList.remove("is-dragging");
      const clamped = _clampTranslations(_scale, _translateX, _translateY);
      _applyTransform(_scale, clamped.x, clamped.y, true);
    });

    // Dismissal via backdrop click
    lightbox.addEventListener("click", (e) => {
      if (hasMovedSignificant) {
        hasMovedSignificant = false;
        return;
      }
      if (e.target === lightbox) {
        if (_scale > 1.05) {
          resetLightboxZoom(true);
        } else {
          closePhotoLightbox();
        }
      }
    });

    window.addEventListener("resize", () => {
      if (_scale > 1.05) {
        const clamped = _clampTranslations(_scale, _translateX, _translateY);
        _applyTransform(_scale, clamped.x, clamped.y, false);
      }
    });
  }

  resetLightboxZoom(false);

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
    resetLightboxZoom(false);
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
