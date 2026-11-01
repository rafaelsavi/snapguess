/**
 * Unified Match Metadata Component for SnapGuess.
 *
 * Renders a standardized 2-category specification panel:
 *  1. Game Setup (Mode, Targets/Guessing, Rounds, Time Limit)
 *  2. Library Filters (Libraries, Places, Albums, People, Dates, Shared / Full Library)
 *
 * Used across the Match Results Summary (#summary-meta), Challenge Cards in
 * Challenges Hub, and Challenge Entry screens.
 */

import { t, tOr } from "../i18n.js";
import { escapeHtml } from "../formatters.js";

export { escapeHtml };

/**
 * Render an array of match meta item objects to HTML.
 * @param {Array<Object>} items
 * @returns {string}
 */
export function renderMatchMetaItemsHtml(items) {
  if (!items || items.length === 0) return "";
  return items
    .map(
      (item) => {
        const rawListAttr = item.rawList && item.rawList.length > 0
          ? ` data-meta-list="${escapeHtml(JSON.stringify(item.rawList))}"`
          : "";
        return `
    <div class="match-meta-item meta-${escapeHtml(item.type)}"
         title="${escapeHtml(item.title || item.val)}"
         data-tooltip="${escapeHtml(item.title || item.val)}"
         data-label="${escapeHtml(item.label || "")}"
         data-val="${escapeHtml(item.val || "")}"
         role="button"
         tabindex="0"
         aria-label="${escapeHtml(item.title || item.val)}"${rawListAttr}>
      <span class="match-meta-item-icon" aria-hidden="true">${item.icon}</span>
      <div class="match-meta-item-body">
        <span class="match-meta-item-label">${escapeHtml(item.label)}</span>
        <span class="match-meta-item-val">${escapeHtml(item.val)}</span>
      </div>
    </div>
  `;
      }
    )
    .join("");
}

/**
 * Build structured specification item objects for both categories.
 * @param {Object} data - Match summary, challenge object, or game config.
 * @returns {{ gameItems: Array<Object>, libItems: Array<Object> }}
 */
export function getMatchMetaCategories(data) {
  if (!data) {
    return { gameItems: [], libItems: [] };
  }

  const filterConfig = data.config || data;

  const isShuffle = (data.game_mode || filterConfig.game_mode) === "unshuffle";
  const modeEmoji = isShuffle ? "🔀" : "🎯";
  const modeLabel = isShuffle ? t("mode.unshuffle") : t("mode.pinpoint");
  const modeDesc = isShuffle ? t("mode.unshuffle_desc") : t("mode.pinpoint_desc");

  // 1. Targets / Guessing Mode
  const locMode = data.location_mode !== undefined ? data.location_mode : filterConfig.location_mode;
  const dateMode = data.date_mode !== undefined ? data.date_mode : filterConfig.date_mode;
  let targetsLabel = "";
  let targetsIcon = "🧭";
  if (locMode && dateMode) {
    targetsLabel = tOr("meta.targets_loc_date", "Location & Date");
    targetsIcon = "🧭";
  } else if (locMode) {
    targetsLabel = tOr("meta.targets_loc_only", "Location only");
    targetsIcon = "📍";
  } else if (dateMode) {
    targetsLabel = tOr("meta.targets_date_only", "Date only");
    targetsIcon = "📅";
  } else {
    targetsLabel = "—";
    targetsIcon = "🧭";
  }

  // 2. Rounds Count
  const rounds = data.rounds || data.round_count || data.rounds_played || data.total_rounds || filterConfig.round_count || 10;
  const roundsUnit = tOr("challenges_page.rounds_label", "Rounds");
  const roundsVal = `${rounds} ${roundsUnit}`;

  // 3. Round Time Limit
  const rawRoundLen = data.round_length || filterConfig.round_length || "1m";
  let timerVal = rawRoundLen;
  if (rawRoundLen === "unlimited" || rawRoundLen === "none") {
    timerVal = tOr("meta.time_unlimited", "Unlimited");
  } else {
    const timerKey = `setup.round_${rawRoundLen}`;
    timerVal = tOr(timerKey, rawRoundLen);
  }

  const gameItems = [
    {
      type: "mode",
      icon: modeEmoji,
      label: tOr("meta.mode_label", "Mode"),
      val: modeLabel,
      title: modeDesc,
    },
    {
      type: "targets",
      icon: targetsIcon,
      label: tOr("meta.targets_label", "Targets"),
      val: targetsLabel,
      title: `${t("setup.game_settings_label") || "What to Guess"}: ${targetsLabel}`,
    },
    {
      type: "rounds",
      icon: "🔢",
      label: tOr("meta.rounds_label", "Rounds"),
      val: roundsVal,
      title: `${rounds} ${t("setup.rounds_label") || "Rounds"}`,
    },
    {
      type: "timer",
      icon: "⏱️",
      label: tOr("meta.time_limit_label", "Time Limit"),
      val: timerVal,
      title: `${t("setup.round_length_label") || "Round Length"}: ${timerVal}`,
    },
  ];

  // 4. Library Setup / Pool Filters
  const libItems = [];

  // Libraries
  const libraries = data.libraries || filterConfig.libraries;
  if (libraries && libraries.length > 0) {
    const libVal = libraries.join(", ");
    const libLabel = libraries.length > 1
      ? tOr("meta.libraries_label", "Libraries")
      : tOr("meta.library_label", "Library");
    libItems.push({
      type: "library",
      icon: "📚",
      label: libLabel,
      val: libVal,
      title: `${libLabel}: ${libVal}`,
      rawList: libraries,
    });
  }

  // Places (Countries / Cities)
  const countries = filterConfig.countries || [];
  const cities = filterConfig.cities || [];
  if (countries.length > 0 || cities.length > 0) {
    const placesList = [...countries, ...cities];
    const placesVal = placesList.length <= 2 ? placesList.join(", ") : `${placesList[0]} +${placesList.length - 1}`;
    const placesLabel = tOr("meta.places_label", "Places");
    libItems.push({
      type: "places",
      icon: "🌍",
      label: placesLabel,
      val: placesVal,
      title: `${placesLabel}: ${placesList.join(", ")}`,
      rawList: placesList,
    });
  }

  // Albums
  const albumNames = filterConfig.album_names || filterConfig.albums || [];
  if (albumNames.length > 0) {
    const albumVal = albumNames.length <= 2 ? albumNames.join(", ") : `${albumNames[0]} +${albumNames.length - 1}`;
    const albumsLabel = tOr("meta.albums_label", "Albums");
    libItems.push({
      type: "albums",
      icon: "📁",
      label: albumsLabel,
      val: albumVal,
      title: `${albumsLabel}: ${albumNames.join(", ")}`,
      rawList: albumNames,
    });
  }

  // People
  const personNames = filterConfig.person_names || filterConfig.people || [];
  if (personNames.length > 0) {
    const pVal = personNames.length <= 2 ? personNames.join(", ") : `${personNames[0]} +${personNames.length - 1}`;
    const peopleLabel = tOr("meta.people_label", "People");
    libItems.push({
      type: "people",
      icon: "👤",
      label: peopleLabel,
      val: pVal,
      title: `${peopleLabel}: ${personNames.join(", ")}`,
      rawList: personNames,
    });
  }

  // Dates
  if (filterConfig.min_date || filterConfig.max_date) {
    const dateVal = `${filterConfig.min_date || "—"} → ${filterConfig.max_date || "—"}`;
    const datesLabel = tOr("meta.dates_label", "Dates");
    libItems.push({
      type: "dates",
      icon: "📅",
      label: datesLabel,
      val: dateVal,
      title: `${datesLabel}: ${dateVal}`,
    });
  }

  // Shared
  if (filterConfig.include_shared) {
    libItems.push({
      type: "shared",
      icon: "🔗",
      label: tOr("meta.shared_label", "Shared"),
      val: tOr("meta.shared_included", "Included"),
      title: tOr("meta.scope_shared_desc", "Shared albums included"),
    });
  }

  // Full Library fallback when no filters are set
  if (libItems.length === 0) {
    libItems.push({
      type: "all",
      icon: "🌐",
      label: tOr("meta.scope_heading", "Photo Filters"),
      val: tOr("meta.scope_all", "Full Library"),
      title: tOr("meta.scope_all_desc", "All Photos (Full Library)"),
    });
  }

  return { gameItems, libItems };
}

/**
 * Generate HTML markup for the 2-category match specifications.
 * @param {Object} data - Match summary or challenge data.
 * @returns {string}
 */
export function buildMatchMetaHtml(data) {
  const { gameItems, libItems } = getMatchMetaCategories(data);
  if (gameItems.length === 0 && libItems.length === 0) return "";

  const gameSetupTitle = tOr("meta.game_setup_heading", "Game Setup");
  const libFiltersTitle = tOr("meta.library_setup_heading", "Library Filters");

  return `
    <div class="match-meta-section">
      <!-- Category 1: Game Setup -->
      <div class="match-meta-category category-game-setup" title="${escapeHtml(gameSetupTitle)}">
        <div class="match-meta-cat-header" aria-hidden="true">
          <span class="match-meta-cat-icon">⚙️</span>
        </div>
        <div class="match-meta-items">
          ${renderMatchMetaItemsHtml(gameItems)}
        </div>
      </div>

      <!-- Category 2: Library Setup / Pool Filters -->
      <div class="match-meta-category category-library-filters" title="${escapeHtml(libFiltersTitle)}">
        <div class="match-meta-cat-header" aria-hidden="true">
          <span class="match-meta-cat-icon">🎛️</span>
        </div>
        <div class="match-meta-items">
          ${renderMatchMetaItemsHtml(libItems)}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the match meta specifications directly into a DOM container.
 * @param {HTMLElement} container
 * @param {Object} data
 */
export function renderMatchMeta(container, data) {
  if (!container) return;
  container.innerHTML = buildMatchMetaHtml(data);
}

let _tooltipEl = null;
let _activeChip = null;

function ensureTooltipEl() {
  if (_tooltipEl && document.body.contains(_tooltipEl)) return _tooltipEl;
  let el = document.getElementById("match-meta-tooltip");
  if (!el) {
    el = document.createElement("div");
    el.id = "match-meta-tooltip";
    el.className = "match-meta-tooltip";
    el.setAttribute("role", "tooltip");
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }
  _tooltipEl = el;
  return _tooltipEl;
}

export function hideMatchMetaTooltip() {
  if (_tooltipEl) {
    _tooltipEl.classList.remove("visible");
    _tooltipEl.setAttribute("aria-hidden", "true");
  }
  if (_activeChip) {
    if (_activeChip.dataset.originalTitle) {
      _activeChip.setAttribute("title", _activeChip.dataset.originalTitle);
      delete _activeChip.dataset.originalTitle;
    }
    _activeChip.removeAttribute("aria-describedby");
    _activeChip = null;
  }
}

export function showMatchMetaTooltip(chip) {
  if (!chip) return;
  if (_activeChip === chip) {
    hideMatchMetaTooltip();
    return;
  }
  hideMatchMetaTooltip();

  const tooltipEl = ensureTooltipEl();
  const rawTitle = chip.getAttribute("data-tooltip") || chip.getAttribute("title") || "";
  const label = chip.getAttribute("data-label") || "";
  const val = chip.getAttribute("data-val") || "";
  const icon = chip.querySelector(".match-meta-item-icon")?.textContent || "";
  let list = null;
  if (chip.dataset.metaList) {
    try {
      list = JSON.parse(chip.dataset.metaList);
    } catch {
      list = null;
    }
  }

  let contentHtml = "";
  if (list && list.length > 1) {
    const listItems = list.map((item) => `<li>• ${escapeHtml(item)}</li>`).join("");
    contentHtml = `
      <div class="match-meta-tooltip-header">
        <span class="match-meta-tooltip-icon">${escapeHtml(icon)}</span>
        <span class="match-meta-tooltip-title">${escapeHtml(label)} (${list.length})</span>
      </div>
      <ul class="match-meta-tooltip-list">${listItems}</ul>
    `;
  } else if (label) {
    const displayTitle = label ? (val && val !== label ? `${label}: ${val}` : label) : val;
    contentHtml = `
      <div class="match-meta-tooltip-header">
        <span class="match-meta-tooltip-icon">${escapeHtml(icon)}</span>
        <span class="match-meta-tooltip-title">${escapeHtml(displayTitle)}</span>
      </div>
      ${rawTitle && rawTitle !== val && rawTitle !== displayTitle ? `<div class="match-meta-tooltip-desc">${escapeHtml(rawTitle)}</div>` : ""}
    `;
  } else {
    contentHtml = `<div class="match-meta-tooltip-desc">${escapeHtml(rawTitle)}</div>`;
  }

  tooltipEl.innerHTML = contentHtml;

  if (chip.hasAttribute("title")) {
    chip.dataset.originalTitle = chip.getAttribute("title");
    chip.removeAttribute("title");
  }

  _activeChip = chip;
  chip.setAttribute("aria-describedby", "match-meta-tooltip");

  tooltipEl.style.visibility = "hidden";
  tooltipEl.classList.add("visible");
  tooltipEl.setAttribute("aria-hidden", "false");

  const chipRect = chip.getBoundingClientRect();
  const tipWidth = tooltipEl.offsetWidth;
  const tipHeight = tooltipEl.offsetHeight;
  const viewportWidth = window.innerWidth;

  const chipCenter = chipRect.left + chipRect.width / 2;
  let left = chipCenter - tipWidth / 2;
  const minLeft = 10;
  const maxLeft = viewportWidth - tipWidth - 10;
  left = Math.max(minLeft, Math.min(left, maxLeft));

  const arrowLeft = Math.max(12, Math.min(chipCenter - left, tipWidth - 12));
  tooltipEl.style.setProperty("--arrow-left", `${arrowLeft}px`);

  const spaceAbove = chipRect.top;
  const gap = 8;
  if (spaceAbove >= tipHeight + gap + 10) {
    tooltipEl.style.top = `${chipRect.top - tipHeight - gap}px`;
    tooltipEl.classList.remove("pos-bottom");
    tooltipEl.classList.add("pos-top");
  } else {
    tooltipEl.style.top = `${chipRect.bottom + gap}px`;
    tooltipEl.classList.remove("pos-top");
    tooltipEl.classList.add("pos-bottom");
  }

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.visibility = "visible";
}

let _tooltipsInitialized = false;
export function initMatchMetaTooltips() {
  if (_tooltipsInitialized || typeof document === "undefined") return;
  _tooltipsInitialized = true;

  document.addEventListener("click", (e) => {
    const chip = e.target.closest(".match-meta-item");
    if (chip) {
      e.stopPropagation();
      showMatchMetaTooltip(chip);
      return;
    }
    if (_activeChip && !_tooltipEl?.contains(e.target)) {
      hideMatchMetaTooltip();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideMatchMetaTooltip();
    } else if ((e.key === "Enter" || e.key === " ") && e.target.closest(".match-meta-item")) {
      e.preventDefault();
      showMatchMetaTooltip(e.target.closest(".match-meta-item"));
    }
  });

  window.addEventListener("scroll", () => {
    if (_activeChip) hideMatchMetaTooltip();
  }, { passive: true });

  window.addEventListener("resize", () => {
    if (_activeChip) hideMatchMetaTooltip();
  }, { passive: true });
}

if (typeof document !== "undefined") {
  initMatchMetaTooltips();
}

