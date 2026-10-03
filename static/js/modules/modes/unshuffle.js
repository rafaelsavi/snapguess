import { t, formatDate } from "../i18n.js";
import { state, el } from "../state.js";
import { createStandardMap, createBadgePinIcon, updateSubmitState, fitMapToBounds, applySpiderfy, unregisterActiveMap, toggleMapFullscreen } from "../maps.js";
import { renderGuessingModeSettings } from "./common.js";
import { readGameSettings } from "../game_settings.js";
import { playerNameCell, buildCell, renderRoundMeta } from "../formatters.js";
import { animateScoreRollup, createPerfectBadge } from "../effects.js";
import { openReportModal } from "../components/report_modal.js";
import { openPhotoLightbox, closePhotoLightbox, isPhotoLightboxOpen } from "../components/lightbox.js";
import { renderRevealTableHeaders, renderRevealTableRows } from "../components/reveal_table.js";
import { RoundStage } from "../components/round_stage.js";
import { challenge } from "../challenge/index.js";

let shuffleMarkers = {}; // pinId -> Leaflet marker
let spiderLines = {};    // pinId -> L.polyline connector line
let truePinCoords = {};  // pinId -> { lat, lng } original coordinates
let helpModalInitialized = false;
let _shuffleStage = null;
let _revealMarkerByKey = {};

let mediaQueryList = null;
let mediaQueryHandler = null;

const dragState = {
  active: false,
  draggedPhotoId: null,
  draggedIndex: null,
  ghostEl: null,
  touchTimer: null,
  touchStartX: 0,
  touchStartY: 0,
  lastTarget: null,
  justDragged: false,
  activeTouchId: null,
  cleanupListeners: null,
};

let lastHorizontalMode = null;

function isHorizontalLayout() {
  if (window.innerWidth < 1024) return false;
  const cardsCol = el.shuffleCardsList || document.getElementById("shuffle-cards-list");
  if (cardsCol && cardsCol.classList.contains("no-map")) return true;
  if (state.currentQuestion && !state.currentQuestion.location_mode) return true;
  return false;
}

window.addEventListener("resize", () => {
  const currentMode = isHorizontalLayout();
  if (lastHorizontalMode !== null && currentMode !== lastHorizontalMode) {
    lastHorizontalMode = currentMode;
    const cardsCol = el.shuffleCardsList || document.getElementById("shuffle-cards-list");
    if (cardsCol && state.currentQuestion) {
      renderPhotoCardsList(cardsCol, state.currentQuestion);
    }
  } else if (lastHorizontalMode === null) {
    lastHorizontalMode = currentMode;
  }
});

function announceReorder(newIndex) {
  let liveEl = document.getElementById("shuffle-live");
  if (!liveEl) {
    liveEl = document.createElement("div");
    liveEl.id = "shuffle-live";
    liveEl.className = "sr-only";
    liveEl.setAttribute("aria-live", "polite");
    document.body.appendChild(liveEl);
  }
  liveEl.textContent = t("game.shuffle_reordered", { position: newIndex + 1 });
}

function resetDragState() {
  if (dragState.touchTimer) {
    clearTimeout(dragState.touchTimer);
    dragState.touchTimer = null;
  }
  if (typeof dragState.cleanupListeners === "function") {
    dragState.cleanupListeners();
    dragState.cleanupListeners = null;
  }
  if (dragState.ghostEl) {
    try {
      dragState.ghostEl.remove();
    } catch (_) { }
    dragState.ghostEl = null;
  }
  dragState.active = false;
  dragState.activeTouchId = null;
  dragState.draggedPhotoId = null;
  dragState.draggedIndex = null;
  dragState.lastTarget = null;

  document.querySelectorAll(".shuffle-card-row").forEach((c) => {
    c.classList.remove("dragging", "drag-over-before", "drag-over-after");
  });
}

function reorderPhoto(fromIndex, toIndex, containerEl, questionData, focusDirection = null) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
  const orderedIds = state.unshuffleState ? state.unshuffleState.orderedPhotoIds || [] : [];
  if (fromIndex >= orderedIds.length || toIndex >= orderedIds.length) return;

  const [movedId] = orderedIds.splice(fromIndex, 1);
  orderedIds.splice(toIndex, 0, movedId);

  announceReorder(toIndex);

  renderPhotoCardsList(containerEl, questionData, {
    focusPhotoId: movedId,
    focusDirection: focusDirection || (toIndex < fromIndex ? "up" : "down"),
  });
}

function attachMouseDragHandlers(card, photoId, index, containerEl, questionData, orderedIds) {
  card.addEventListener("dragstart", (e) => {
    if (state.timedOut || state.submitting || state.unshuffleDisabled) {
      e.preventDefault();
      return;
    }
    dragState.active = true;
    dragState.draggedPhotoId = photoId;
    dragState.draggedIndex = index;
    card.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", photoId);
    }
  });

  card.addEventListener("dragover", (e) => {
    if (!dragState.active || dragState.draggedIndex === null) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }

    const rect = card.getBoundingClientRect();
    const horiz = isHorizontalLayout();
    const midpoint = horiz ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    const cursor = horiz ? e.clientX : e.clientY;
    const isBefore = cursor < midpoint;

    if (isBefore) {
      card.classList.add("drag-over-before");
      card.classList.remove("drag-over-after");
    } else {
      card.classList.add("drag-over-after");
      card.classList.remove("drag-over-before");
    }
  });

  card.addEventListener("dragleave", (e) => {
    if (!card.contains(e.relatedTarget)) {
      card.classList.remove("drag-over-before", "drag-over-after");
    }
  });

  card.addEventListener("drop", (e) => {
    if (!dragState.active || dragState.draggedIndex === null) return;
    e.preventDefault();
    card.classList.remove("drag-over-before", "drag-over-after");

    const fromIndex = dragState.draggedIndex;
    const rect = card.getBoundingClientRect();
    const horiz = isHorizontalLayout();
    const midpoint = horiz ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    const cursor = horiz ? e.clientX : e.clientY;
    const isBefore = cursor < midpoint;

    let targetIndex = index;
    if (fromIndex < index) {
      targetIndex = isBefore ? index - 1 : index;
    } else if (fromIndex > index) {
      targetIndex = isBefore ? index : index + 1;
    }
    targetIndex = Math.max(0, Math.min(orderedIds.length - 1, targetIndex));

    resetDragState();
    if (fromIndex !== targetIndex) {
      reorderPhoto(fromIndex, targetIndex, containerEl, questionData);
    } else {
      renderPhotoCardsList(containerEl, questionData);
    }
  });

  card.addEventListener("dragend", () => {
    resetDragState();
  });
}

function attachTouchDragHandlers(card, photoId, index, containerEl, questionData, orderedIds) {
  const onTouchStart = (e) => {
    if (state.timedOut || state.submitting || state.unshuffleDisabled) return;
    if (e.touches.length > 1) return;
    // Disallow initiating card dragging when touching interactive controls or action panels
    if (
      e.target.closest("button") ||
      e.target.closest(".shuffle-card-actions")
    ) {
      return;
    }

    const touch = e.touches[0];
    const touchId = touch.identifier;

    // Reset any prior drag or hold timer
    resetDragState();

    dragState.activeTouchId = touchId;
    dragState.touchStartX = touch.clientX;
    dragState.touchStartY = touch.clientY;

    // Pre-drag listeners: actively monitor touchmove on window with passive: true so that
    // native page scrolling is never blocked. If finger moves > 6px, cancel drag immediately!
    const cleanupPreDragListeners = () => {
      window.removeEventListener("touchmove", onPreTouchMove);
      window.removeEventListener("touchend", onPreTouchEnd);
      window.removeEventListener("touchcancel", onPreTouchCancel);
      if (dragState.cleanupListeners === cleanupPreDragListeners) {
        dragState.cleanupListeners = null;
      }
    };

    const onPreTouchMove = (moveEvt) => {
      const currentTouch = Array.from(moveEvt.touches).find((t) => t.identifier === touchId);
      if (!currentTouch) return;

      const dx = currentTouch.clientX - dragState.touchStartX;
      const dy = currentTouch.clientY - dragState.touchStartY;
      const dist = Math.hypot(dx, dy);

      // If finger moves more than 6px before the 250ms hold delay,
      // this is a scroll/swipe gesture! Cancel drag immediately so page scrolling is completely unaffected.
      if (dist > 6) {
        if (dragState.touchTimer) {
          clearTimeout(dragState.touchTimer);
          dragState.touchTimer = null;
        }
        cleanupPreDragListeners();
      }
    };

    const onPreTouchEnd = () => {
      // Touch released before hold duration completed (quick tap)
      if (dragState.touchTimer) {
        clearTimeout(dragState.touchTimer);
        dragState.touchTimer = null;
      }
      cleanupPreDragListeners();
    };

    const onPreTouchCancel = () => {
      // Browser initiated native scroll or gesture cancelled
      if (dragState.touchTimer) {
        clearTimeout(dragState.touchTimer);
        dragState.touchTimer = null;
      }
      cleanupPreDragListeners();
    };

    window.addEventListener("touchmove", onPreTouchMove, { passive: true });
    window.addEventListener("touchend", onPreTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onPreTouchCancel, { passive: true });
    dragState.cleanupListeners = cleanupPreDragListeners;

    // 250ms long-press hold delay: requires user to hold still to engage drag
    dragState.touchTimer = setTimeout(() => {
      dragState.touchTimer = null;
      cleanupPreDragListeners();

      // Initiate active dragging
      dragState.active = true;
      dragState.draggedPhotoId = photoId;
      dragState.draggedIndex = index;
      card.classList.add("dragging");

      const rect = card.getBoundingClientRect();
      const ghost = card.cloneNode(true);
      ghost.classList.add("drag-ghost");
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      ghost.style.left = `${touch.clientX - rect.width / 2}px`;
      ghost.style.top = `${touch.clientY - rect.height / 2}px`;

      document.body.appendChild(ghost);
      dragState.ghostEl = ghost;

      if (navigator.vibrate) {
        try { navigator.vibrate(30); } catch (_) { }
      }

      // Active drag listeners on window
      const cleanupActiveDragListeners = () => {
        window.removeEventListener("touchmove", onActiveTouchMove);
        window.removeEventListener("touchend", onActiveTouchEnd);
        window.removeEventListener("touchcancel", onActiveTouchCancel);
        if (dragState.cleanupListeners === cleanupActiveDragListeners) {
          dragState.cleanupListeners = null;
        }
      };

      const onActiveTouchMove = (activeEvt) => {
        const activeTouch = Array.from(activeEvt.touches).find((t) => t.identifier === touchId);
        if (!activeTouch) return;

        // Prevent page scrolling while intentionally dragging a picked-up card
        activeEvt.preventDefault();

        if (dragState.ghostEl) {
          const cardRect = card.getBoundingClientRect();
          dragState.ghostEl.style.left = `${activeTouch.clientX - cardRect.width / 2}px`;
          dragState.ghostEl.style.top = `${activeTouch.clientY - cardRect.height / 2}px`;
        }

        if (dragState.ghostEl) dragState.ghostEl.style.display = "none";
        const elemBelow = document.elementFromPoint(activeTouch.clientX, activeTouch.clientY);
        if (dragState.ghostEl) dragState.ghostEl.style.display = "";

        const targetCard = elemBelow ? elemBelow.closest(".shuffle-card-row") : null;

        containerEl.querySelectorAll(".shuffle-card-row").forEach((c) => {
          c.classList.remove("drag-over-before", "drag-over-after");
        });

        if (targetCard && targetCard !== card && containerEl.contains(targetCard)) {
          const targetRect = targetCard.getBoundingClientRect();
          const horiz = isHorizontalLayout();
          const midpoint = horiz
            ? targetRect.left + targetRect.width / 2
            : targetRect.top + targetRect.height / 2;
          const cursor = horiz ? activeTouch.clientX : activeTouch.clientY;
          const isBefore = cursor < midpoint;

          if (isBefore) {
            targetCard.classList.add("drag-over-before");
          } else {
            targetCard.classList.add("drag-over-after");
          }

          const targetIdx = parseInt(targetCard.getAttribute("data-index"), 10);
          dragState.lastTarget = { card: targetCard, isBefore, index: targetIdx };
        } else {
          dragState.lastTarget = null;
        }
      };

      const onActiveTouchEnd = () => {
        cleanupActiveDragListeners();

        if (!dragState.active) return;

        dragState.justDragged = true;
        setTimeout(() => { dragState.justDragged = false; }, 300);

        const fromIdx = dragState.draggedIndex;
        const lastTarget = dragState.lastTarget;

        resetDragState();

        if (lastTarget && typeof lastTarget.index === "number" && fromIdx !== null) {
          const toCardIdx = lastTarget.index;
          let finalIdx = toCardIdx;
          if (fromIdx < toCardIdx) {
            finalIdx = lastTarget.isBefore ? toCardIdx - 1 : toCardIdx;
          } else if (fromIdx > toCardIdx) {
            finalIdx = lastTarget.isBefore ? toCardIdx : toCardIdx + 1;
          }
          finalIdx = Math.max(0, Math.min(orderedIds.length - 1, finalIdx));
          if (finalIdx !== fromIdx) {
            reorderPhoto(fromIdx, finalIdx, containerEl, questionData);
          }
        }
      };

      const onActiveTouchCancel = () => {
        cleanupActiveDragListeners();
        resetDragState();
      };

      window.addEventListener("touchmove", onActiveTouchMove, { passive: false });
      window.addEventListener("touchend", onActiveTouchEnd);
      window.addEventListener("touchcancel", onActiveTouchCancel);
      dragState.cleanupListeners = cleanupActiveDragListeners;
    }, 250);
  };

  card.addEventListener("touchstart", onTouchStart, { passive: true });
}

function ensureShuffleHelpModal() {
  const modal = el.unshuffleHelpModal || document.getElementById("unshuffle-help-modal");
  if (!modal) return null;

  if (!helpModalInitialized) {
    helpModalInitialized = true;
    const closeBtn = el.shuffleHelpCloseBtn || modal.querySelector(".modal-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
      });
    }

    let isBackdropPress = false;
    modal.addEventListener("pointerdown", (event) => {
      isBackdropPress = (event.target === modal);
    });
    modal.addEventListener("click", (event) => {
      if (isBackdropPress && event.target === modal) {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
      }
      isBackdropPress = false;
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.classList.contains("hidden")) {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
      }
    });
  }

  return modal;
}

function openShuffleHelpModal(questionData) {
  const modal = ensureShuffleHelpModal();
  if (!modal) return;

  const titleEl = modal.querySelector("#shuffle-help-title");
  if (titleEl) titleEl.textContent = t("game.shuffle_help_title");

  const body = modal.querySelector(".shuffle-help-body");
  if (!body) return;

  const locationMode = questionData?.location_mode !== false;
  const dateMode = questionData?.date_mode !== false;

  const sections = [];
  if (locationMode) {
    const locItems = [
      t("game.shuffle_help_location_item1"),
      t("game.shuffle_help_location_item2"),
      t("game.shuffle_help_location_item3"),
    ].filter(s => s && s.trim());
    sections.push(`
      <div class="shuffle-help-section">
        <h4>${t("game.shuffle_help_location_title")}</h4>
        <ul>
          ${locItems.map(item => `<li>${item}</li>`).join("")}
        </ul>
      </div>
    `);
  }

  if (dateMode) {
    const dateItems = [
      t("game.shuffle_help_date_item1"),
      t("game.shuffle_help_date_item2"),
      t("game.shuffle_help_date_item3"),
    ].filter(s => s && s.trim());
    sections.push(`
      <div class="shuffle-help-section">
        <h4>${t("game.shuffle_help_date_title")}</h4>
        <ul>
          ${dateItems.map(item => `<li>${item}</li>`).join("")}
        </ul>
      </div>
    `);
  }

  body.innerHTML = sections.join("");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

export const unshuffleMode = {
  name: "unshuffle",

  openHelp(questionData) {
    openShuffleHelpModal(questionData);
  },

  refreshHelpModal(questionData) {
    // If the help modal is currently visible, re-populate its body in the new language.
    const modal = document.getElementById("unshuffle-help-modal");
    if (modal && !modal.classList.contains("hidden")) {
      openShuffleHelpModal(questionData);
    }
  },

  refreshQuestionLanguage(questionData) {
    this.refreshHelpModal(questionData);
    const cardsCol = el.shuffleCardsList || document.getElementById("shuffle-cards-list");
    if (cardsCol && questionData) {
      renderPhotoCardsList(cardsCol, questionData);
    }
  },

  setDisabled(disabled) {
    state.unshuffleDisabled = Boolean(disabled);
    const uiContainer = document.getElementById("unshuffle-ui");
    if (uiContainer) {
      if (disabled) {
        uiContainer.classList.add("shuffle-disabled");
      } else {
        uiContainer.classList.remove("shuffle-disabled");
      }
    }
    const cardsCol = document.getElementById("shuffle-cards-list");
    if (cardsCol && state.currentQuestion) {
      renderPhotoCardsList(cardsCol, state.currentQuestion);
    }
  },

  renderSettings(containerEl) {
    renderGuessingModeSettings(containerEl, "unshuffle");
  },

  getModePayload() {
    const locCard = document.getElementById("card-goal-location");
    const locCheckbox = document.getElementById("goal-location");
    const dateCard = document.getElementById("card-goal-date");
    const dateCheckbox = document.getElementById("goal-date");

    const savedSettings = readGameSettings();
    let savedLoc = true;
    let savedDate = true;
    if (savedSettings) {
      if (typeof savedSettings.location_mode === "boolean") savedLoc = savedSettings.location_mode;
      if (typeof savedSettings.date_mode === "boolean") savedDate = savedSettings.date_mode;
    }

    let locationMode = locCheckbox ? locCheckbox.checked : (locCard ? locCard.classList.contains("active") : savedLoc);
    let dateMode = dateCheckbox ? dateCheckbox.checked : (dateCard ? dateCard.classList.contains("active") : savedDate);

    if (!locationMode && !dateMode) {
      locationMode = true;
      dateMode = true;
    }

    return {
      game_mode: "unshuffle",
      location_mode: locationMode,
      date_mode: dateMode,
    };
  },

  mount(hostEl, matchConfig) {
    this.hostEl = hostEl;
    const host = document.getElementById("mode-active-host") || hostEl;
    if (host) {
      host.replaceChildren();
      const tmpl = document.getElementById("tmpl-mode-unshuffle");
      if (tmpl) {
        host.appendChild(tmpl.content.cloneNode(true));
      }
    }
    const uiContainer = document.getElementById("unshuffle-ui");
    if (uiContainer) {
      uiContainer.classList.remove("hidden");
    }

    if (!mediaQueryList && window.matchMedia) {
      mediaQueryList = window.matchMedia("(min-width: 1024px)");
      mediaQueryHandler = () => {
        if (state.currentQuestion && !state.currentQuestion.location_mode) {
          const cardsCol = el.shuffleCardsList || document.getElementById("shuffle-cards-list");
          if (cardsCol) {
            renderPhotoCardsList(cardsCol, state.currentQuestion);
          }
        }
      };
      if (mediaQueryList.addEventListener) {
        mediaQueryList.addEventListener("change", mediaQueryHandler);
      } else if (mediaQueryList.addListener) {
        mediaQueryList.addListener(mediaQueryHandler);
      }
    }
  },

  unmount() {
    resetDragState();
    if (mediaQueryList && mediaQueryHandler) {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener("change", mediaQueryHandler);
      } else if (mediaQueryList.removeListener) {
        mediaQueryList.removeListener(mediaQueryHandler);
      }
      mediaQueryList = null;
      mediaQueryHandler = null;
    }
    state.unshuffleDisabled = false;
    if (state.guessMap) {
      try { unregisterActiveMap(state.guessMap); state.guessMap.remove(); } catch (_) { }
      state.guessMap = null;
    }
    if (state.revealMap) {
      try { unregisterActiveMap(state.revealMap); state.revealMap.remove(); } catch (_) { }
      state.revealMap = null;
    }
    shuffleMarkers = {};
    spiderLines = {};
    truePinCoords = {};
    state.unshuffleState = null;
    if (el.modeActiveHost) {
      el.modeActiveHost.replaceChildren();
    }
    if (el.unshuffleRevealUi) {
      el.unshuffleRevealUi.classList.add("hidden");
    }
    if (el.shuffleRevealTableHead) {
      el.shuffleRevealTableHead.replaceChildren();
    }
    if (el.shuffleRevealTableBody) {
      el.shuffleRevealTableBody.replaceChildren();
    }
  },

  onReady(questionData) { },

  toggleMapFullscreen() {
    if (el.shuffleMapShell) {
      toggleMapFullscreen(el.shuffleMapShell);
    }
  },

  togglePhotoFullscreen() {
    if (isPhotoLightboxOpen()) {
      closePhotoLightbox();
      return;
    }
    const photos = state.currentQuestion?.batch_photos || [];
    if (!photos.length) return;
    const photo = photos[0];
    if (photo?.media_url) {
      openPhotoLightbox(photo.media_url);
    }
  },

  renderQuestion(questionData) {
    state.unshuffleDisabled = false;
    if (el.mediaFrame) el.mediaFrame.classList.add("hidden");

    let uiContainer = document.getElementById("unshuffle-ui");
    if (!uiContainer) {
      const host = document.getElementById("mode-active-host") || this.hostEl || el.guessingUi;
      const tmpl = document.getElementById("tmpl-mode-unshuffle");
      if (tmpl && host) {
        host.appendChild(tmpl.content.cloneNode(true));
      }
      uiContainer = document.getElementById("unshuffle-ui");
    }
    if (uiContainer) {
      uiContainer.classList.remove("hidden");
      uiContainer.classList.remove("shuffle-disabled");
    }

    // Initialize photo order & pin assignments
    const photos = questionData.batch_photos || [];
    state.unshuffleState = {
      orderedPhotoIds: photos.map((p) => p.photo_id),
      pinAssignments: {}, // photoId -> pinId
    };

    photos.forEach((p) => {
      state.unshuffleState.pinAssignments[p.photo_id] = null;
    });

    const boardEl = uiContainer ? uiContainer.querySelector(".shuffle-board") : null;
    const mapCol = uiContainer ? uiContainer.querySelector(".shuffle-map-column") : null;
    const mapShell = el.shuffleMapShell;
    const cardsCol = el.shuffleCardsList;

    if (!questionData.location_mode) {
      if (mapCol) mapCol.style.display = "none";
      if (boardEl) boardEl.classList.add("no-map");
      if (cardsCol) cardsCol.classList.add("no-map");
    } else {
      if (mapCol) mapCol.style.display = "";
      if (boardEl) boardEl.classList.remove("no-map");
      if (cardsCol) cardsCol.classList.remove("no-map");
    }

    if (mapShell) {
      mapShell.replaceChildren();
    }
    if (cardsCol) {
      cardsCol.replaceChildren();
    }

    if (questionData.location_mode && mapShell) {
      renderShuffleMap(mapShell, questionData.batch_pins, questionData);
    }
    if (cardsCol) {
      renderPhotoCardsList(cardsCol, questionData);
    }
  },

  buildAnswerPayload(questionData, timedOut) {
    const orderedIds = state.unshuffleState ? state.unshuffleState.orderedPhotoIds || [] : [];
    const pinAssignments = state.unshuffleState ? state.unshuffleState.pinAssignments || {} : {};

    const answers = orderedIds.map((photoId, timelineIndex) => {
      return {
        photo_id: photoId,
        assigned_pin_id: pinAssignments[photoId] || null,
        assigned_timeline_index: timelineIndex,
      };
    });

    return {
      match_id: state.matchId,
      question_id: questionData.question_id,
      unshuffle: answers,
      timed_out: timedOut,
    };
  },

  renderReveal(revealUi, revealData, skipEffects = false) {
    if (el.pinpointRevealUi) el.pinpointRevealUi.classList.add("hidden");
    if (el.mediaFrame) el.mediaFrame.classList.add("hidden");

    const targetContainer = el.unshuffleRevealUi;
    if (targetContainer) targetContainer.classList.remove("hidden");
    revealUi.classList.remove("hidden");

    const playerResults = revealData.results || [];
    const batchReveal = revealData.batch_reveal || [];
    const totalPhotos = batchReveal.length;

    // Standardize Round Meta header banner (matching Pinpoint mode)
    const activePlayer = challenge && challenge.isActive() ? challenge.challengeSession?.sessionPlayerName : null;
    if (el.roundMeta) {
      renderRoundMeta(el.roundMeta, {
        roundNum: revealData.round_number,
        totalRounds: revealData.total_rounds,
        isReveal: true,
        playerName: activePlayer,
      });
    }

    // Sort batch items in TRUE chronological order (earliest #1 to latest #N)
    const sortedTrueBatch = [...batchReveal].sort((a, b) => {
      const dateA = a.actual_date ? new Date(a.actual_date).getTime() : 0;
      const dateB = b.actual_date ? new Date(b.actual_date).getTime() : 0;
      return dateA - dateB;
    });

    // Map photo_id to true rank index (0-based)
    const trueRankMap = {};
    sortedTrueBatch.forEach((item, trueRankIdx) => {
      trueRankMap[item.photo_id] = trueRankIdx;
    });

    // Compute player accuracy metrics
    const playerAccuracy = {};
    playerResults.forEach((pRes) => {
      const pGuesses = pRes.unshuffle_guesses || [];
      let correctPins = 0;
      let correctRanks = 0;

      batchReveal.forEach((item) => {
        const pGuess = pGuesses.find((g) => String(g.photo_id) === String(item.photo_id));
        if (pGuess) {
          if (pGuess.assigned_pin_id && String(pGuess.assigned_pin_id) === String(item.true_pin_id)) {
            correctPins++;
          }
          const trueRank = trueRankMap[item.photo_id];
          if (pGuess.assigned_timeline_index !== null && pGuess.assigned_timeline_index === trueRank) {
            correctRanks++;
          }
        }
      });

      playerAccuracy[pRes.player_name] = { correctPins, correctRanks };
    });

    // --- SECTION 1: ROUND STAGE (PHOTO TABS & MAP SPLIT) ---
    const stageEl = document.querySelector("#unshuffle-reveal-ui .round-stage");
    if (stageEl) {
      if (!_shuffleStage) {
        _shuffleStage = new RoundStage(stageEl, {
          idPrefix: "shuffle-",
          showReportButton: true,
          onPhotoChange: (idx, photo) => {
            if (photo && photo.true_pin_id && _revealMarkerByKey[String(photo.true_pin_id)]) {
              try {
                _revealMarkerByKey[String(photo.true_pin_id)].openPopup();
              } catch (_) {}
            }
          },
          onReportPhoto: (photoId, mediaUrl) => {
            const pName = activePlayer || (state.players && state.players[0]) || null;
            openReportModal(photoId, mediaUrl, pName);
          },
        });
      }
      _shuffleStage.setModes({
        locationMode: Boolean(revealData.location_mode),
        dateMode: Boolean(revealData.date_mode),
      });
      _shuffleStage.setPhotos(sortedTrueBatch, 0);
    }

    const reportPhotoBtn = document.getElementById("shuffle-report-btn");
    if (reportPhotoBtn) {
      reportPhotoBtn.setAttribute("data-i18n-title", "report.btn_label");
      reportPhotoBtn.setAttribute("data-i18n-aria-label", "report.btn_label");
    }

    // --- SECTION 2: POINT SCORING RESULTS TABLE (PINPOINT STYLE) ---
    const table = el.shuffleRevealTable || document.getElementById("shuffle-reveal-table");
    renderRevealTableHeaders(table, {
      locationMode: Boolean(revealData.location_mode),
      dateMode: Boolean(revealData.date_mode),
      gameMode: "unshuffle",
      showRank: false,
    });

    const maxPoints = revealData.score_max_points || state.scoreMaxPoints || 100;
    renderRevealTableRows(table, playerResults, {
      locationMode: Boolean(revealData.location_mode),
      dateMode: Boolean(revealData.date_mode),
      gameMode: "unshuffle",
      maxPoints,
      skipEffects,
      showRank: false,
      totalPhotos,
      playerAccuracy,
    });

    // --- SECTION 3: MAP LAYOUT (ONLY IF LOCATION MODE IS ACTIVE) ---
    if (revealData.location_mode && el.revealShuffleMapShell) {
      el.revealShuffleMapShell.classList.remove("hidden");
      renderBatchRevealMap(el.revealShuffleMapShell, batchReveal);
    } else {
      if (el.revealShuffleMapShell) el.revealShuffleMapShell.classList.add("hidden");
    }

    // Update shared reveal action controls
    if (el.nextRound) {
      el.nextRound.textContent = revealData.match_finished ? t("reveal.see_results_btn") : t("reveal.next_round_btn");
    }
    if (el.revealRestartBtn) {
      el.revealRestartBtn.classList.toggle("hidden", Boolean(challenge && challenge.isActive()));
    }
  },

  refreshRevealText(revealUi, revealData) {
    // Re-render all reveal text without re-initializing the map or running animations.
    this.renderReveal(revealUi, revealData, true);
  },

  refreshQuestionLanguage(questionData) {
    const cardsList = document.getElementById("shuffle-cards-list");
    if (cardsList && questionData && state.currentQuestion) {
      renderPhotoCardsList(cardsList, questionData);
    }
  },

  addOpponentReveal(revealUi, revealData, newOpponents) {
    this.renderReveal(revealUi, revealData, true);
  },
};

let activeBreakdownViewMode = "photo";

const PIN_COLORS = {
  A: "#059669", 1: "#059669",
  B: "#d97706", 2: "#d97706",
  C: "#883aed", 3: "#883aed",
  D: "#db2777", 4: "#db2777",
  E: "#2563eb", 5: "#2563eb",
};

export function getPinColor(pinId) {
  if (!pinId) return "#0f7c7f";
  const rawColor = PIN_COLORS[pinId] || PIN_COLORS[String(pinId).toUpperCase()] || "#0f7c7f";
  if (typeof rawColor === "string" && rawColor.startsWith("#") && rawColor.length === 9) {
    return rawColor.slice(0, 7);
  }
  return rawColor;
}

function assignPinToPhoto(photoId, pinId, questionData, containerEl = null) {
  if (state.timedOut || state.submitting || state.unshuffleDisabled) return;
  if (!state.unshuffleState) return;

  const pinAssignments = state.unshuffleState.pinAssignments || {};
  const currentPinOfThisPhoto = pinAssignments[photoId];

  if (currentPinOfThisPhoto === pinId) {
    // Tapping the same assigned pin unassigns it
    pinAssignments[photoId] = null;
  } else {
    // Smart swap: if another photo currently has this pin, swap or clear it
    const otherPhotoId = Object.keys(pinAssignments).find(
      (pid) => pid !== photoId && pinAssignments[pid] === pinId
    );
    if (otherPhotoId) {
      pinAssignments[otherPhotoId] = currentPinOfThisPhoto || null;
    }
    pinAssignments[photoId] = pinId;
  }

  const pins = questionData?.batch_pins || [];
  updateShuffleMapMarkers(pins);

  const cardsList = containerEl || el.shuffleCardsList || document.getElementById("shuffle-cards-list");
  if (cardsList && questionData) {
    renderPhotoCardsList(cardsList, questionData);
  }

  updateSubmitState();
}

function renderPhotoCardsList(containerEl, questionData, focusOptions = null) {
  containerEl.replaceChildren();
  containerEl.setAttribute("role", "list");

  const isDisabled = Boolean(state.timedOut || state.unshuffleDisabled);
  const orderedIds = state.unshuffleState ? state.unshuffleState.orderedPhotoIds || [] : [];
  const pinAssignments = state.unshuffleState ? state.unshuffleState.pinAssignments || {} : {};
  const photosMap = {};
  (questionData.batch_photos || []).forEach((p) => {
    photosMap[p.photo_id] = p;
  });

  const isHoriz = isHorizontalLayout();
  let elementToFocus = null;

  if (questionData.date_mode && orderedIds.length > 0) {
    const topHeader = document.createElement("div");
    topHeader.className = "shuffle-timeline-header oldest";
    const oldestIcon = isHoriz ? "⬅️" : "⬆️";
    topHeader.innerHTML = `<span>${oldestIcon} <span data-i18n="game.shuffle_oldest">${t("game.shuffle_oldest")}</span></span>`;
    containerEl.appendChild(topHeader);
  }

  orderedIds.forEach((photoId, index) => {
    const photo = photosMap[photoId];
    if (!photo) return;

    const assignedPin = questionData.location_mode ? pinAssignments[photoId] : null;
    const pinColor = assignedPin ? getPinColor(assignedPin) : null;
    const card = document.createElement("div");
    card.className = `shuffle-card-row ${isDisabled ? "disabled" : ""} ${assignedPin ? "assigned" : ""}`;
    card.setAttribute("data-photo-id", photoId);
    card.setAttribute("data-index", String(index));
    card.setAttribute("role", "listitem");

    if (questionData.date_mode && !isDisabled) {
      card.setAttribute("draggable", "true");
      card.setAttribute("aria-roledescription", "sortable item");
      card.setAttribute(
        "aria-label",
        t("game.shuffle_photo_label", { index: index + 1, total: orderedIds.length })
      );
      attachMouseDragHandlers(card, photoId, index, containerEl, questionData, orderedIds);
      attachTouchDragHandlers(card, photoId, index, containerEl, questionData, orderedIds);
    } else {
      card.setAttribute("draggable", "false");
    }

    if (assignedPin && pinColor) {
      card.style.borderColor = pinColor;
      card.style.backgroundColor = `${pinColor}18`;
      card.style.boxShadow = `0 2px 10px ${pinColor}25`;
    } else {
      card.style.borderColor = "";
      card.style.backgroundColor = "";
      card.style.boxShadow = "";
    }

    // Thumbnail
    const thumbWrap = document.createElement("div");
    thumbWrap.className = "shuffle-card-thumb-wrap";

    const img = document.createElement("img");
    img.className = "shuffle-card-thumb-lg";
    img.src = photo.media_url;
    img.alt = `Photo ${index + 1}`;
    img.addEventListener("click", () => {
      if (dragState.justDragged) return;
      openPhotoLightbox(photo.media_url);
    });

    thumbWrap.append(img);

    // Right Action Panel: Pin Chips + Rank Controls stacked vertically
    const rightActions = document.createElement("div");
    rightActions.className = "shuffle-card-actions";

    const pinBadgeWrap = document.createElement("div");
    pinBadgeWrap.className = "shuffle-card-details";

    if (questionData.location_mode) {
      const pinChipsWrap = document.createElement("div");
      pinChipsWrap.className = "shuffle-pin-selector";
      pinChipsWrap.setAttribute("role", "group");
      pinChipsWrap.setAttribute("aria-label", "Assign pin");

      const batchPins = questionData.batch_pins || [];
      batchPins.forEach((pin) => {
        const letter = pin.pin_id;
        const color = getPinColor(letter);
        const isChipActive = assignedPin === letter;

        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `shuffle-pin-chip ${isChipActive ? "active shuffle-assigned-pin-badge assigned" : ""}`;
        chip.dataset.pin = letter;
        chip.textContent = letter;
        chip.title = `Assign Pin ${letter}`;
        chip.setAttribute("aria-label", `Assign Pin ${letter}`);
        chip.disabled = isDisabled;

        if (isChipActive) {
          chip.style.backgroundColor = color;
          chip.style.borderColor = color;
          chip.style.color = "#ffffff";
          chip.style.boxShadow = `0 2px 6px ${color}66`;
        } else {
          chip.style.borderColor = color;
          chip.style.color = color;
        }

        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          assignPinToPhoto(photoId, letter, questionData, containerEl);
        });

        pinChipsWrap.appendChild(chip);
      });

      pinBadgeWrap.appendChild(pinChipsWrap);
    } else {
      pinBadgeWrap.style.display = "none";
    }

    const rankControls = document.createElement("div");
    rankControls.className = "shuffle-rank-controls";

    if (!questionData.date_mode) {
      rankControls.style.display = "none";
    }

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "shuffle-rank-btn";
    upBtn.textContent = isHoriz ? "◀" : "▲";
    if (isHoriz) {
      upBtn.title = t("game.move_left");
      upBtn.setAttribute("data-i18n-title", "game.move_left");
      upBtn.setAttribute("aria-label", t("game.move_left"));
      upBtn.setAttribute("data-i18n-aria-label", "game.move_left");
    } else {
      upBtn.title = t("game.move_up");
      upBtn.setAttribute("data-i18n-title", "game.move_up");
      upBtn.setAttribute("aria-label", t("game.move_up"));
      upBtn.setAttribute("data-i18n-aria-label", "game.move_up");
    }
    upBtn.disabled = index === 0 || isDisabled;
    upBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.timedOut || state.submitting || state.unshuffleDisabled) return;
      if (index > 0) {
        reorderPhoto(index, index - 1, containerEl, questionData, "up");
      }
    });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "shuffle-rank-btn";
    downBtn.textContent = isHoriz ? "▶" : "▼";
    if (isHoriz) {
      downBtn.title = t("game.move_right");
      downBtn.setAttribute("data-i18n-title", "game.move_right");
      downBtn.setAttribute("aria-label", t("game.move_right"));
      downBtn.setAttribute("data-i18n-aria-label", "game.move_right");
    } else {
      downBtn.title = t("game.move_down");
      downBtn.setAttribute("data-i18n-title", "game.move_down");
      downBtn.setAttribute("aria-label", t("game.move_down"));
      downBtn.setAttribute("data-i18n-aria-label", "game.move_down");
    }
    downBtn.disabled = index === orderedIds.length - 1 || isDisabled;
    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.timedOut || state.submitting || state.unshuffleDisabled) return;
      if (index < orderedIds.length - 1) {
        reorderPhoto(index, index + 1, containerEl, questionData, "down");
      }
    });

    if (focusOptions && focusOptions.focusPhotoId === photoId) {
      if (focusOptions.focusDirection === "up") {
        elementToFocus = !upBtn.disabled ? upBtn : downBtn;
      } else if (focusOptions.focusDirection === "down") {
        elementToFocus = !downBtn.disabled ? downBtn : upBtn;
      } else {
        elementToFocus = card;
      }
    }

    rankControls.append(upBtn, downBtn);
    rightActions.append(pinBadgeWrap, rankControls);
    card.append(thumbWrap, rightActions);
    containerEl.appendChild(card);
  });

  if (questionData.date_mode && orderedIds.length > 0) {
    const bottomFooter = document.createElement("div");
    bottomFooter.className = "shuffle-timeline-header newest";
    const newestIcon = isHoriz ? "➡️" : "⬇️";
    if (isHoriz) {
      bottomFooter.innerHTML = `<span><span data-i18n="game.shuffle_newest">${t("game.shuffle_newest")}</span> ${newestIcon}</span>`;
    } else {
      bottomFooter.innerHTML = `<span>${newestIcon} <span data-i18n="game.shuffle_newest">${t("game.shuffle_newest")}</span></span>`;
    }
    containerEl.appendChild(bottomFooter);
  }

  lastHorizontalMode = isHoriz;

  if (questionData.location_mode && questionData.batch_pins) {
    updateShuffleMapMarkers(questionData.batch_pins);
  }

  updateSubmitState();

  if (elementToFocus) {
    elementToFocus.focus();
  }
}

function getPinMarkerDetails(pinId) {
  const pinAssignments = state.unshuffleState ? state.unshuffleState.pinAssignments || {} : {};
  const orderedIds = state.unshuffleState ? state.unshuffleState.orderedPhotoIds || [] : [];
  const assignedPhotoId = Object.keys(pinAssignments).find(
    (photoId) => pinAssignments[photoId] === pinId
  );
  const photos = state.currentQuestion?.batch_photos || [];
  const assignedPhoto = assignedPhotoId ? photos.find((p) => p.photo_id === assignedPhotoId) : null;

  return {
    isTaken: Boolean(assignedPhotoId && orderedIds.includes(assignedPhotoId)),
    badgeText: pinId,
    bgColor: getPinColor(pinId),
    photoUrl: assignedPhoto?.media_url || null,
  };
}

function updateShuffleMapMarkers(pins) {
  if (!pins) return;
  pins.forEach((pin) => {
    const { isTaken, badgeText, bgColor, photoUrl } = getPinMarkerDetails(pin.pin_id);
    const el = document.getElementById(`pin-marker-${pin.pin_id}`);
    if (el) {
      if (isTaken && photoUrl) {
        el.classList.add("assigned", "has-photo");
        el.classList.remove("unassigned");
        el.innerHTML = `<img src="${photoUrl}" class="shuffle-pin-photo-img" alt="Pin ${badgeText}" /><span class="shuffle-pin-letter-badge" style="background:${bgColor};">${badgeText}</span>`;
        el.style.background = "#ffffff";
        el.style.color = "#ffffff";
        el.style.borderColor = bgColor;
        el.style.borderWidth = "3px";
        el.style.opacity = "1";
        el.style.boxShadow = "0 3px 10px rgba(0,0,0,0.35)";
      } else if (isTaken) {
        el.classList.add("assigned");
        el.classList.remove("unassigned", "has-photo");
        el.textContent = badgeText;
        el.style.background = bgColor;
        el.style.color = "#ffffff";
        el.style.borderColor = "#ffffff";
        el.style.borderWidth = "2px";
        el.style.opacity = "1";
        el.style.boxShadow = "0 3px 8px rgba(0,0,0,0.35)";
      } else {
        el.classList.add("unassigned");
        el.classList.remove("assigned", "has-photo");
        el.textContent = badgeText;
        el.style.background = "#ffffff";
        el.style.color = bgColor;
        el.style.borderColor = bgColor;
        el.style.borderWidth = "2px";
        el.style.opacity = "1";
        el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
      }
    }
  });
}

function renderShuffleMap(containerEl, pins, questionData) {
  if (!window.L) return;
  shuffleMarkers = {};

  const mapShell = containerEl.id ? containerEl : (el.shuffleMapShell || document.getElementById("shuffle-map-shell"));
  const map = createStandardMap(mapShell, { existingMap: state.guessMap, titleKey: "game.fullscreen_map_title" });
  state.guessMap = map;

  if (!map) return;

  const bounds = L.latLngBounds();

  // Store true coordinates and place markers at their true positions.
  // Visual separation of overlapping pins is handled dynamically by applySpiderfy().
  truePinCoords = {};
  pins.forEach((pin) => {
    const lat = pin && pin.latitude != null ? Number(pin.latitude) : NaN;
    const lon = pin && pin.longitude != null ? Number(pin.longitude) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    truePinCoords[pin.pin_id] = { lat, lng: lon };
    bounds.extend([lat, lon]);

    const { isTaken, badgeText, bgColor, photoUrl } = getPinMarkerDetails(pin.pin_id);
    const icon = createBadgePinIcon(badgeText, bgColor, {
      id: `pin-marker-${pin.pin_id}`,
      isTaken,
      size: 36,
      photoUrl,
    });

    const marker = L.marker([lat, lon], { icon }).addTo(map);
    shuffleMarkers[pin.pin_id] = marker;

    marker.on("click", () => {
      if (state.timedOut || state.submitting || state.unshuffleDisabled) return;
      const pinAssignments = state.unshuffleState ? state.unshuffleState.pinAssignments || {} : {};
      const assignedPhotoId = Object.keys(pinAssignments).find((pid) => pinAssignments[pid] === pin.pin_id);
      if (assignedPhotoId) {
        const photo = (questionData.batch_photos || []).find((p) => p.photo_id === assignedPhotoId);
        if (photo?.media_url) {
          openPhotoLightbox(photo.media_url);
        }
      }
    });
  });

  // Register zoom-aware spiderfy: runs once after initial fit and on every zoom change.
  map.on("zoomend", () => applySpiderfy(map, truePinCoords, shuffleMarkers, spiderLines, getPinColor));
  if (pins.length > 0 && bounds.isValid()) {
    fitMapToBounds(map, bounds, { padding: [50, 50], maxZoom: 15 });
    map.once("moveend", () => applySpiderfy(map, truePinCoords, shuffleMarkers, spiderLines, getPinColor));
  }
}

function renderBatchRevealMap(containerEl, batchItems) {
  if (!window.L) return;

  const validItems = (batchItems || []).filter((item) => {
    if (!item || item.actual_latitude == null || item.actual_longitude == null) return false;
    const lat = Number(item.actual_latitude);
    const lon = Number(item.actual_longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && !(Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6);
  });

  if (validItems.length === 0) {
    if (containerEl) containerEl.style.display = "none";
    const prev = containerEl ? containerEl.previousElementSibling : null;
    if (prev && prev.classList.contains("field-head")) {
      prev.style.display = "none";
    }
    return;
  }

  containerEl.style.display = "block";

  const map = createStandardMap(containerEl, { existingMap: state.revealMap, titleKey: "game.fullscreen_map_title" });
  state.revealMap = map;

  if (!map) return;

  const bounds = L.latLngBounds();

  // Local spiderfy state — scoped to this reveal instance.
  const revealTrueCoords = {};
  const revealMarkerByKey = {};
  const revealSpiderLines = {};

  validItems.forEach((item) => {
    const key = String(item.true_pin_id);
    const lat = Number(item.actual_latitude);
    const lon = Number(item.actual_longitude);
    bounds.extend([lat, lon]);
    revealTrueCoords[key] = { lat, lng: lon };

    const pinColor = getPinColor(item.true_pin_id);
    const photoUrl = item.media_url || (item.photo_id ? `/api/media/${item.photo_id}` : (item.asset_id ? `/api/media/${encodeURIComponent(item.asset_id)}` : null));
    const icon = createBadgePinIcon(item.true_pin_id, pinColor, { isTaken: true, size: 36, photoUrl });

    const dateStr = item.actual_date ? formatDate(item.actual_date, { year: "numeric", month: "short", day: "numeric" }) : "";
    const marker = L.marker([lat, lon], { icon })
      .bindPopup(`<b>${item.true_pin_id}</b><br>${dateStr}`)
      .addTo(map);

    const selectPhoto = () => {
      if (_shuffleStage && Array.isArray(_shuffleStage.photos)) {
        const pIdx = _shuffleStage.photos.findIndex((p) => String(p.true_pin_id) === String(item.true_pin_id));
        if (pIdx >= 0) {
          _shuffleStage.setActivePhoto(pIdx);
        }
      }
    };
    marker.on("click", selectPhoto);
    marker.on("popupopen", selectPhoto);

    revealMarkerByKey[key] = marker;
  });
  _revealMarkerByKey = revealMarkerByKey;

  // Register zoom-aware spiderfy.
  map.on("zoomend", () =>
    applySpiderfy(map, revealTrueCoords, revealMarkerByKey, revealSpiderLines, getPinColor)
  );
  if (validItems.length > 0 && bounds.isValid()) {
    fitMapToBounds(map, bounds, { padding: [50, 50], maxZoom: 15 });
    map.once("moveend", () =>
      applySpiderfy(map, revealTrueCoords, revealMarkerByKey, revealSpiderLines, getPinColor)
    );
  }
}

export function getShuffleMaps() {
  return [state.guessMap, state.revealMap].filter(Boolean);
}

