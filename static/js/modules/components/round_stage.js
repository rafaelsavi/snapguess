/**
 * Round Stage Reusable Component.
 *
 * Provides a standardized split layout containing:
 * - Photo Canvas card (single photo or batch photos with tabs, lightbox, fullscreen button, metadata caption)
 * - Map Shell card (reusable Leaflet map container with fullscreen button)
 *
 * Used by in-game live reveal screens (Pinpoint, Unshuffle), the dedicated match replay screen,
 * and summary replay views, providing a single source of truth for stage DOM and photo tabs.
 */

import { t, formatDate } from "../i18n.js";
import { escapeHtml } from "../formatters.js";
import { openPhotoLightbox } from "./lightbox.js";
import { toggleMapFullscreen } from "../maps.js";

export class RoundStage {
  /**
   * @param {HTMLElement} containerEl - Outer container hosting the round stage
   * @param {object} [options]
   * @param {string} [options.idPrefix=""] - Optional ID prefix to assign to elements for locator/API compatibility
   * @param {Function} [options.onPhotoChange] - Callback (photoIndex, photoData) when tabs switch
   * @param {Function} [options.onReportPhoto] - Callback (photoId, mediaUrl) for reporting photo issue
   * @param {boolean} [options.showReportButton=false]
   * @param {Function} [options.onSwipeNext] - Callback when swiping next at boundary
   * @param {Function} [options.onSwipePrev] - Callback when swiping prev at boundary
   */
  constructor(
    containerEl,
    {
      idPrefix = "",
      onPhotoChange = null,
      onReportPhoto = null,
      showReportButton = false,
      onSwipeNext = null,
      onSwipePrev = null,
    } = {}
  ) {
    this.containerEl = containerEl;
    this.idPrefix = idPrefix;
    this.onPhotoChange = onPhotoChange;
    this.onReportPhoto = onReportPhoto;
    this.showReportButton = showReportButton;
    this.onSwipeNext = onSwipeNext;
    this.onSwipePrev = onSwipePrev;

    this.photos = [];
    this.currentPhotoIndex = 0;
    this.locationMode = true;
    this.dateMode = true;

    this._initMarkup();
    this._initSwipeGestures();
  }

  _initMarkup() {
    this.containerEl.classList.add("round-stage", "replay-stage");

    const existingRow = this.containerEl.querySelector(".round-media-map-row, .replay-media-map-row");
    if (!existingRow) {
      this.containerEl.innerHTML = `
        <div class="round-media-map-row replay-media-map-row">
          <div class="round-photo-card replay-photo-card">
            <div class="round-photo-tabs-container replay-photo-tabs-container"></div>
            <div class="media-frame round-media-frame replay-media-frame">
              <img class="quiz-image round-photo-img replay-photo-img" src="" alt="Round photo" />
              <button type="button" class="map-fullscreen-btn round-photo-fullscreen replay-photo-fullscreen" aria-pressed="false"
                title="${escapeHtml(t("game.fullscreen_image_title"))}" data-i18n-title="game.fullscreen_image_title">
                <svg class="fs-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
                  stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <polyline points="9 21 3 21 3 15"></polyline>
                  <line x1="21" y1="3" x2="14" y2="10"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              </button>
            </div>
            <div class="round-photo-caption replay-photo-caption">
              <div class="reveal-actual-row">
                <div class="reveal-actual">
                  <span class="reveal-actual-chip reveal-chip-date">
                    <span class="reveal-chip-icon" aria-hidden="true">📅</span>
                    <strong class="reveal-chip-val round-photo-date replay-photo-date">-</strong>
                  </span>
                  <span class="reveal-actual-chip reveal-chip-location">
                    <span class="reveal-chip-icon" aria-hidden="true">🗺️</span>
                    <strong class="reveal-chip-val round-photo-loc replay-photo-loc">-</strong>
                  </span>
                </div>
                <button type="button" class="btn-report-discrete round-photo-report-btn round-photo-report-btn-icon-only" title="${escapeHtml(t("report.btn_label"))}"
                  data-i18n-title="report.btn_label" aria-label="${escapeHtml(t("report.btn_label"))}" data-i18n-aria-label="report.btn_label">
                  <span aria-hidden="true">🚩</span>
                </button>
              </div>
            </div>
          </div>

          <div class="map-shell round-map-shell replay-map-shell">
            <div class="round-leaflet-map" style="width:100%;height:100%;min-height:420px;"></div>
            <button type="button" class="map-fullscreen-btn round-map-fullscreen replay-map-fullscreen" aria-pressed="false"
              title="${escapeHtml(t("game.fullscreen_map_title"))}" data-i18n-title="game.fullscreen_map_title">
              <svg class="fs-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
                stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    this.mediaMapRow = this.containerEl.querySelector(".round-media-map-row, .replay-media-map-row");
    this.photoCard = this.containerEl.querySelector(".round-photo-card, .replay-photo-card");
    this.tabsContainer = this.containerEl.querySelector(".round-photo-tabs-container, .replay-photo-tabs-container");
    this.mediaFrame = this.containerEl.querySelector(".round-media-frame, .replay-media-frame, .media-frame");
    this.photoImg = this.containerEl.querySelector(".round-photo-img, .replay-photo-img, .quiz-image");
    this.fullscreenBtn = this.containerEl.querySelector(".round-photo-fullscreen, .replay-photo-fullscreen, .media-frame .map-fullscreen-btn");
    this.revealActualRow = this.containerEl.querySelector(".reveal-actual-row");
    this.revealActual = this.containerEl.querySelector(".reveal-actual");
    this.locEl = this.containerEl.querySelector(".round-photo-loc, .replay-photo-loc");
    this.dateEl = this.containerEl.querySelector(".round-photo-date, .replay-photo-date");
    this.dateChip = this.containerEl.querySelector(".reveal-chip-date");
    this.locChip = this.containerEl.querySelector(".reveal-chip-location");
    this.mapShell = this.containerEl.querySelector(".round-map-shell, .replay-map-shell, .map-shell");
    this.mapContainer = this.mapShell
      ? this.mapShell.querySelector(".round-leaflet-map, div[id*='map']")
      : this.containerEl.querySelector(".round-leaflet-map, div[id*='map']");
    this.mapFullscreenBtn = this.mapShell
      ? this.mapShell.querySelector(".round-map-fullscreen, .replay-map-fullscreen, .map-fullscreen-btn")
      : null;
    this.reportBtn = this.containerEl.querySelector(".round-photo-report-btn, .btn-report-discrete");

    if (this.reportBtn) {
      this.reportBtn.style.display = this.showReportButton ? "inline-flex" : "none";
      this.reportBtn.setAttribute("data-i18n-title", "report.btn_label");
      this.reportBtn.setAttribute("data-i18n-aria-label", "report.btn_label");
      this.reportBtn.setAttribute("title", t("report.btn_label"));
      this.reportBtn.setAttribute("aria-label", t("report.btn_label"));
    }

    // Apply specific element IDs for prefix compatibility
    this._applyPrefixIds(this.idPrefix);

    // Fullscreen and lightbox handlers
    if (this.photoImg) {
      this.photoImg.addEventListener("click", () => {
        if (this.photoImg.src) {
          const photoUrls = this.photos
            .map((p) => p.media_url || (p.photo_id ? `/api/media/${p.photo_id}` : (p.asset_id ? `/api/media/${encodeURIComponent(p.asset_id)}` : "")))
            .filter(Boolean);
          openPhotoLightbox(this.photoImg.src, {
            photos: photoUrls.length > 1 ? photoUrls : null,
            currentIndex: this.currentPhotoIndex,
            onIndexChange: (idx) => this.setActivePhoto(idx),
          });
        }
      });
    }

    if (this.fullscreenBtn && this.mediaFrame) {
      this.fullscreenBtn.addEventListener("click", () => {
        toggleMapFullscreen(this.mediaFrame);
      });
    }

    if (this.mapFullscreenBtn && this.mapShell) {
      this.mapFullscreenBtn.addEventListener("click", () => {
        toggleMapFullscreen(this.mapShell);
      });
    }

    if (this.reportBtn && this.onReportPhoto) {
      this.reportBtn.addEventListener("click", () => {
        const cur = this.getCurrentPhoto();
        if (cur) {
          this.onReportPhoto(cur.photo_id || cur.asset_id, cur.media_url || (this.photoImg ? this.photoImg.src : ""));
        }
      });
    }

    if (typeof ResizeObserver !== "undefined" && this.revealActualRow) {
      this._captionObserver = new ResizeObserver((entries) => {
        const entry = entries && entries[0];
        const currentWidth = entry ? Math.round(entry.contentRect.width) : Math.round(this.revealActualRow.clientWidth);
        if (currentWidth > 0 && Math.abs(currentWidth - (this._lastObservedCaptionWidth || 0)) >= 2) {
          this._lastObservedCaptionWidth = currentWidth;
          this.updateCaptionFolding();
        }
      });
      this._captionObserver.observe(this.revealActualRow);
    }
  }

  _applyPrefixIds(prefix) {
    if (!prefix) return;
    if (prefix === "replay-") {
      if (this.mediaMapRow) this.mediaMapRow.id = "replay-media-map-row";
      if (this.photoCard) this.photoCard.id = "replay-photo-card";
      if (this.tabsContainer) this.tabsContainer.id = "replay-photo-tabs-container";
      if (this.mediaFrame) {
        this.mediaFrame.id = "replay-media-frame";
        this.mediaFrame.className = "media-frame replay-media-frame";
      }
      if (this.photoImg) {
        this.photoImg.id = "replay-photo-img";
        this.photoImg.className = "quiz-image replay-photo-img";
      }
      if (this.fullscreenBtn) {
        this.fullscreenBtn.id = "replay-photo-fullscreen";
        this.fullscreenBtn.className = "map-fullscreen-btn";
      }
      if (this.revealActual) this.revealActual.id = "replay-reveal-actual";
      if (this.dateEl) this.dateEl.id = "replay-photo-date";
      if (this.locEl) this.locEl.id = "replay-photo-loc";
      if (this.reportBtn) this.reportBtn.id = "replay-report-btn";
      if (this.mapShell) {
        this.mapShell.id = "replay-map-shell";
        this.mapShell.className = "map-shell replay-map-shell";
      }
      if (this.mapContainer) this.mapContainer.id = "replay-leaflet-map";
    } else if (prefix === "pinpoint-") {
      if (this.mediaMapRow) this.mediaMapRow.id = "pinpoint-media-map-row";
      if (this.photoCard) this.photoCard.id = "pinpoint-photo-card";
      if (this.tabsContainer) this.tabsContainer.id = "pinpoint-photo-tabs-container";
      if (this.mediaFrame) this.mediaFrame.id = "pinpoint-reveal-media-frame";
      if (this.photoImg) this.photoImg.id = "pinpoint-reveal-img";
      if (this.fullscreenBtn) this.fullscreenBtn.id = "pinpoint-photo-fullscreen";
      if (this.revealActual) this.revealActual.id = "reveal-actual";
      if (this.reportBtn) this.reportBtn.id = "reveal-report-btn";
      if (this.mapShell) this.mapShell.id = "reveal-map-shell";
      if (this.mapContainer) this.mapContainer.id = "reveal-map";
      if (this.mapFullscreenBtn) this.mapFullscreenBtn.id = "reveal-map-fullscreen";
    } else if (prefix === "shuffle-") {
      if (this.mediaMapRow) this.mediaMapRow.id = "shuffle-media-map-row";
      if (this.photoCard) this.photoCard.id = "shuffle-photo-card";
      if (this.tabsContainer) this.tabsContainer.id = "shuffle-photo-tabs-container";
      if (this.mediaFrame) this.mediaFrame.id = "shuffle-reveal-media-frame";
      if (this.photoImg) this.photoImg.id = "shuffle-reveal-img";
      if (this.fullscreenBtn) this.fullscreenBtn.id = "shuffle-photo-fullscreen";
      if (this.revealActual) this.revealActual.id = "shuffle-reveal-actual";
      if (this.dateEl) this.dateEl.id = "shuffle-photo-date";
      if (this.locEl) this.locEl.id = "shuffle-photo-loc";
      if (this.reportBtn) this.reportBtn.id = "shuffle-report-btn";
      if (this.mapShell) this.mapShell.id = "reveal-shuffle-map-shell";
      if (this.mapContainer) this.mapContainer.id = "reveal-shuffle-map";
      if (this.mapFullscreenBtn) this.mapFullscreenBtn.id = "reveal-shuffle-map-fullscreen";
    } else {
      if (this.mediaMapRow) this.mediaMapRow.id = `${prefix}media-map-row`;
      if (this.photoCard) this.photoCard.id = `${prefix}photo-card`;
      if (this.tabsContainer) this.tabsContainer.id = `${prefix}photo-tabs-container`;
      if (this.mediaFrame) {
        this.mediaFrame.id = `${prefix}media-frame`;
        this.mediaFrame.className = `media-frame ${prefix}media-frame round-media-frame`;
      }
      if (this.photoImg) {
        this.photoImg.id = `${prefix}photo-img`;
        this.photoImg.className = `quiz-image ${prefix}photo-img round-photo-img`;
      }
      if (this.fullscreenBtn) this.fullscreenBtn.id = `${prefix}photo-fullscreen`;
      if (this.revealActual) this.revealActual.id = `${prefix}reveal-actual`;
      if (this.dateEl) this.dateEl.id = `${prefix}photo-date`;
      if (this.locEl) this.locEl.id = `${prefix}photo-loc`;
      if (this.reportBtn) this.reportBtn.id = `${prefix}report-btn`;
      if (this.mapShell) {
        this.mapShell.id = `${prefix}map-shell`;
        this.mapShell.className = `map-shell ${prefix}map-shell round-map-shell`;
      }
      if (this.mapContainer) this.mapContainer.id = `${prefix}leaflet-map`;
      if (this.mapFullscreenBtn) this.mapFullscreenBtn.id = `${prefix}map-fullscreen`;
    }

    if (this.reportBtn) {
      const textSpan = this.reportBtn.querySelector(".report-discrete-text");
      if (textSpan) {
        textSpan.remove();
      }
      this.reportBtn.classList.add("round-photo-report-btn-icon-only");
    }
  }

  /**
   * Set location and date mode visibility.
   * @param {object} options
   * @param {boolean} [options.locationMode=true]
   * @param {boolean} [options.dateMode=true]
   */
  setModes({ locationMode = true, dateMode = true } = {}) {
    this.locationMode = locationMode;
    this.dateMode = dateMode;
    this.setMapVisible(locationMode);
    if (this.locChip) {
      this.locChip.style.display = locationMode ? "inline-flex" : "none";
    }
    if (this.dateChip) {
      this.dateChip.style.display = dateMode ? "inline-flex" : "none";
    }
  }

  /**
   * Updates photos array and renders active photo & tabs.
   * Sorts batch photos by true_pin_id (A, B, C…) so tabs always match map pin order.
   *
   * @param {Array<object>} photos
   * @param {number} [activeIndex=0]
   */
  setPhotos(photos = [], activeIndex = 0) {
    const raw = Array.isArray(photos) ? photos : [];
    // Sort by true_pin_id alphabetically so "Photo A" always maps to pin A on the map.
    // Photos without a true_pin_id (pinpoint mode) are left in original order.
    const hasPinIds = raw.some((p) => p.true_pin_id);
    this.photos = hasPinIds
      ? [...raw].sort((a, b) => {
        const pa = a.true_pin_id || "";
        const pb = b.true_pin_id || "";
        return pa < pb ? -1 : pa > pb ? 1 : 0;
      })
      : raw;
    this.currentPhotoIndex = Math.max(0, Math.min(activeIndex, this.photos.length - 1));
    this.renderPhotoCanvas();
  }

  getCurrentPhoto() {
    return this.photos[this.currentPhotoIndex] || null;
  }

  /**
   * Programmatically switch the active photo (e.g. when clicking a map pin or swiping).
   * @param {number} index
   * @param {object} [options]
   * @param {string} [options.swipeAnimation] - "next" | "prev"
   */
  setActivePhoto(index, { swipeAnimation = null } = {}) {
    if (!this.photos || this.photos.length === 0) return;
    const targetIdx = Math.max(0, Math.min(index, this.photos.length - 1));
    if (this.currentPhotoIndex === targetIdx) return;
    this.currentPhotoIndex = targetIdx;
    this.renderPhotoCanvas();
    if (swipeAnimation) {
      this.applySwipeAnimation(swipeAnimation);
    }
    if (this.onPhotoChange) {
      this.onPhotoChange(this.currentPhotoIndex, this.getCurrentPhoto());
    }
  }

  applySwipeAnimation(direction) {
    if (!this.photoImg) return;
    const animClass = direction === "next" ? "photo-swipe-next" : "photo-swipe-prev";
    this.photoImg.classList.remove("photo-swipe-next", "photo-swipe-prev", "photo-edge-bounce-left", "photo-edge-bounce-right");
    void this.photoImg.offsetWidth;
    this.photoImg.classList.add(animClass);
    const onEnd = () => {
      if (this.photoImg) {
        this.photoImg.classList.remove(animClass);
        this.photoImg.removeEventListener("animationend", onEnd);
      }
    };
    this.photoImg.addEventListener("animationend", onEnd, { once: true });
  }

  applyEdgeBounce(direction) {
    if (!this.photoImg) return;
    const animClass = direction === "next" ? "photo-edge-bounce-left" : "photo-edge-bounce-right";
    this.photoImg.classList.remove("photo-swipe-next", "photo-swipe-prev", "photo-edge-bounce-left", "photo-edge-bounce-right");
    void this.photoImg.offsetWidth;
    this.photoImg.classList.add(animClass);
    const onEnd = () => {
      if (this.photoImg) {
        this.photoImg.classList.remove(animClass);
        this.photoImg.removeEventListener("animationend", onEnd);
      }
    };
    this.photoImg.addEventListener("animationend", onEnd, { once: true });
  }

  _initSwipeGestures() {
    if (!this.mediaFrame) return;

    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;
    let startTime = 0;
    let isTracking = false;

    const handleTouchStart = (e) => {
      if (e.touches.length > 1) {
        isTracking = false;
        return;
      }
      if (e.target && e.target.closest("button, a")) {
        isTracking = false;
        return;
      }
      isTracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      endX = startX;
      endY = startY;
      startTime = Date.now();
    };

    const handleTouchMove = (e) => {
      if (!isTracking || e.touches.length > 1) return;
      endX = e.touches[0].clientX;
      endY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e) => {
      if (!isTracking) return;
      isTracking = false;

      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const deltaTime = Date.now() - startTime;

      const minDistance = 40;
      if (
        Math.abs(deltaX) >= minDistance &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.25 &&
        deltaTime <= 700
      ) {
        if (deltaX < 0) {
          this.handleSwipe("next");
        } else {
          this.handleSwipe("prev");
        }
      }
    };

    const handleTouchCancel = () => {
      isTracking = false;
    };

    this.mediaFrame.addEventListener("touchstart", handleTouchStart, { passive: true });
    this.mediaFrame.addEventListener("touchmove", handleTouchMove, { passive: true });
    this.mediaFrame.addEventListener("touchend", handleTouchEnd, { passive: true });
    this.mediaFrame.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    this._cleanupSwipe = () => {
      if (this.mediaFrame) {
        this.mediaFrame.removeEventListener("touchstart", handleTouchStart);
        this.mediaFrame.removeEventListener("touchmove", handleTouchMove);
        this.mediaFrame.removeEventListener("touchend", handleTouchEnd);
        this.mediaFrame.removeEventListener("touchcancel", handleTouchCancel);
      }
    };
  }

  handleSwipe(direction) {
    const hasBatch = this.photos && this.photos.length > 1;

    if (direction === "next") {
      if (hasBatch && this.currentPhotoIndex < this.photos.length - 1) {
        this.setActivePhoto(this.currentPhotoIndex + 1, { swipeAnimation: "next" });
      } else if (typeof this.onSwipeNext === "function") {
        this.onSwipeNext();
      } else {
        this.applyEdgeBounce("next");
      }
    } else if (direction === "prev") {
      if (hasBatch && this.currentPhotoIndex > 0) {
        this.setActivePhoto(this.currentPhotoIndex - 1, { swipeAnimation: "prev" });
      } else if (typeof this.onSwipePrev === "function") {
        this.onSwipePrev();
      } else {
        this.applyEdgeBounce("prev");
      }
    }
  }

  renderPhotoCanvas() {
    if (!this.photos || this.photos.length === 0) return;

    if (this.tabsContainer) {
      if (this.photos.length > 1) {
        this.tabsContainer.innerHTML = `
          <div class="replay-photo-tabs round-photo-tabs">
            ${this.photos
            .map(
              (p, idx) => `
                <button type="button" class="replay-photo-tab-btn round-photo-tab-btn ${idx === this.currentPhotoIndex ? "active" : ""}" data-idx="${idx}">
                  ${t("replay.photo_label", p.true_pin_id || String(idx + 1))}
                </button>
              `
            )
            .join("")}
          </div>
        `;
        this.tabsContainer.querySelectorAll(".round-photo-tab-btn, .replay-photo-tab-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            const idx = parseInt(btn.getAttribute("data-idx"), 10);
            const animDir = idx > this.currentPhotoIndex ? "next" : "prev";
            this.setActivePhoto(idx, { swipeAnimation: animDir });
          });
        });
      } else {
        this.tabsContainer.innerHTML = "";
      }
    }

    const curPhoto = this.getCurrentPhoto();
    if (!curPhoto) return;

    const mediaUrl = curPhoto.media_url || (curPhoto.photo_id ? `/api/media/${curPhoto.photo_id}` : (curPhoto.asset_id ? `/api/media/${encodeURIComponent(curPhoto.asset_id)}` : ""));
    if (this.photoImg && mediaUrl) {
      this.photoImg.src = mediaUrl;
    }

    const locParts = [curPhoto.actual_city, curPhoto.actual_country].filter(Boolean);
    const locStr = locParts.length > 0
      ? locParts.join(", ")
      : (curPhoto.actual_latitude != null
        ? `${Number(curPhoto.actual_latitude).toFixed(3)}, ${Number(curPhoto.actual_longitude).toFixed(3)}`
        : "");

    let dateText = "";
    if (curPhoto.actual_date) {
      dateText = formatDate(curPhoto.actual_date, { year: "numeric", month: "short", day: "numeric" });
    }
    if (!dateText && curPhoto.actual_year && curPhoto.actual_month) {
      dateText = `${String(curPhoto.actual_month).padStart(2, "0")}/${curPhoto.actual_year}`;
    }
    if (!dateText && curPhoto.actual_year) {
      dateText = String(curPhoto.actual_year);
    }

    const showLoc = (this.locationMode !== false) && Boolean(locStr || curPhoto.actual_latitude != null);
    const showDate = (this.dateMode !== false) && Boolean(dateText || curPhoto.actual_date || curPhoto.actual_year);

    if (this.revealActual) {
      this.revealActual.replaceChildren();
      if (showDate) {
        const dateChip = document.createElement("span");
        dateChip.className = "reveal-actual-chip reveal-chip-date";
        const dateIcon = document.createElement("span");
        dateIcon.className = "reveal-chip-icon";
        dateIcon.setAttribute("aria-hidden", "true");
        dateIcon.textContent = "📅";
        const valSpan = document.createElement("strong");
        valSpan.className = "reveal-chip-val round-photo-date replay-photo-date";
        if (this.idPrefix === "pinpoint-") {
          valSpan.id = "round-photo-date";
        } else if (this.idPrefix) {
          valSpan.id = `${this.idPrefix}photo-date`;
        } else {
          valSpan.id = "round-photo-date";
        }
        valSpan.textContent = dateText;
        dateChip.title = dateText || "";
        dateChip.append(dateIcon, valSpan);
        this.revealActual.appendChild(dateChip);
      }
      if (showLoc) {
        const locChip = document.createElement("span");
        locChip.className = "reveal-actual-chip reveal-chip-location";
        const locIcon = document.createElement("span");
        locIcon.className = "reveal-chip-icon";
        locIcon.setAttribute("aria-hidden", "true");
        locIcon.textContent = "🗺️";
        const valSpan = document.createElement("strong");
        valSpan.className = "reveal-chip-val round-photo-loc replay-photo-loc";
        if (this.idPrefix === "pinpoint-") {
          valSpan.id = "round-photo-loc";
        } else if (this.idPrefix) {
          valSpan.id = `${this.idPrefix}photo-loc`;
        } else {
          valSpan.id = "round-photo-loc";
        }
        const fullLoc = locStr || t("stats.location_unknown");
        valSpan.textContent = fullLoc;
        locChip.title = fullLoc;
        locChip.append(locIcon, valSpan);
        this.revealActual.appendChild(locChip);
      }
      this.updateCaptionFolding();
      requestAnimationFrame(() => this.updateCaptionFolding());
    }
  }

  /**
   * Dynamically fold the photo caption into 2 rows if date + location do not fit
   * on a single line, placing the date on row 1 (left), report flag on row 1 (right),
   * and location on row 2 (left).
   */
  updateCaptionFolding() {
    if (!this.revealActualRow || this._isUpdatingFolding) return;
    const dateChip = this.revealActualRow.querySelector(".reveal-chip-date");
    const locChip = this.revealActualRow.querySelector(".reveal-chip-location");
    const reportBtn = this.revealActualRow.querySelector(".btn-report-discrete, .round-photo-report-btn");

    if (!dateChip || !locChip) {
      this.revealActualRow.classList.remove("folded-two-rows");
      return;
    }

    const availableW = this.revealActualRow.clientWidth;
    if (availableW <= 0) return;

    this._isUpdatingFolding = true;
    try {
      const dateW = Math.ceil(dateChip.getBoundingClientRect().width || dateChip.offsetWidth || 0);
      const btnW = (reportBtn && reportBtn.style.display !== "none")
        ? Math.ceil(reportBtn.getBoundingClientRect().width || reportBtn.offsetWidth || 26)
        : 0;

      const locVal = locChip.querySelector(".reveal-chip-val");
      const icon = locChip.querySelector(".reveal-chip-icon");
      const iconW = icon ? Math.ceil(icon.getBoundingClientRect().width || icon.offsetWidth || 16) : 16;

      // Calculate unconstrained natural width needed by the location chip:
      // val text scrollWidth + icon width + icon-text gap (5px) + chip horizontal padding (0.55rem * 2 ~ 18px) + border (2px)
      const locTextW = locVal ? locVal.scrollWidth : 0;
      const locNaturalW = locTextW > 0
        ? (locTextW + iconW + 25)
        : Math.ceil(locChip.scrollWidth || locChip.offsetWidth || 0);

      const gap = 6;
      const totalNeeded = dateW + locNaturalW + btnW + (btnW > 0 ? gap * 2 : gap);

      const isFolded = this.revealActualRow.classList.contains("folded-two-rows");
      // Use hysteresis buffer (6px) to prevent borderline oscillation
      const shouldFold = isFolded ? (totalNeeded > availableW - 6) : (totalNeeded > availableW);

      this.revealActualRow.classList.toggle("folded-two-rows", shouldFold);
    } finally {
      this._isUpdatingFolding = false;
    }
  }

  /**
   * Show or hide the map shell in the split view (e.g. date-only mode).
   * @param {boolean} visible
   */
  setMapVisible(visible) {
    if (this.mapShell) {
      this.mapShell.classList.toggle("hidden", !visible);
    }
    if (this.mediaMapRow) {
      this.mediaMapRow.classList.toggle("single-col", !visible);
    }
  }

  getMapElement() {
    return this.mapContainer;
  }

  destroy() {
    if (this._cleanupSwipe) {
      this._cleanupSwipe();
      this._cleanupSwipe = null;
    }
    if (this._captionObserver) {
      this._captionObserver.disconnect();
      this._captionObserver = null;
    }
  }
}

