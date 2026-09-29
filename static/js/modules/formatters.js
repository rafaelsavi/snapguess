import { state } from "./state.js";
import { t, formatNumber } from "./i18n.js";

export const PLAYER_COLORS = [
  "#f25f5c",
  "#0f7c7f",
  "#7048e8",
  "#f7b267",
  "#2f80ed",
  "#e0338d",
  "#3aa655",
  "#8d5524",
  "#17a2b8",
  "#fd7e14",
  "#6f42c1",
  "#20c997",
  "#d63384",
  "#4d96ff",
  "#ff6b6b",
  "#198754",
];

export const ACTUAL_COLOR = "#1f2a44";

/**
 * Resolve a player name from the authenticated identity, local storage, or a fallback.
 * @param {string|null} [storageKey=null]
 * @param {function(): string|null} [fallbackFn=null]
 * @returns {string}
 */
export function resolvePlayerName(storageKey = null, fallbackFn = null) {
  if (state.auth?.name && state.auth.name.trim()) {
    return state.auth.name.trim();
  }
  if (state.auth?.email && state.auth.email.trim()) {
    const userPart = state.auth.email.split("@")[0].trim();
    if (userPart) {
      return userPart.charAt(0).toUpperCase() + userPart.slice(1);
    }
  }
  if (storageKey) {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && saved.trim()) {
        return saved.trim();
      }
    } catch (_) {}
  }
  if (typeof fallbackFn === "function") {
    try {
      const fallback = fallbackFn();
      if (fallback && fallback.trim()) {
        return fallback.trim();
      }
    } catch (_) {}
  }
  return "";
}

/**
 * Escapes HTML characters for safe attribute and text insertion.
 * @param {string|number} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str && str !== 0) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function normalizedName(playerName) {
  return String(playerName || "?").replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Deterministically computes a persistent hex color token for any player name.
 * Shares 100% parity with backend deterministic_player_color.
 * @param {string|number} playerName
 * @returns {string} Hex color code
 */
export function playerColor(playerName) {
  if (typeof playerName === "number") {
    return PLAYER_COLORS[Math.abs(playerName) % PLAYER_COLORS.length];
  }
  if (!playerName) {
    return PLAYER_COLORS[0];
  }

  const clean = String(playerName || "").trim().toLowerCase();
  if (!clean) {
    return PLAYER_COLORS[0];
  }
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash += clean.charCodeAt(i);
  }
  return PLAYER_COLORS[hash % PLAYER_COLORS.length];
}

/**
 * Deterministically computes 1-2 letter initials for player avatar chips.
 * 1 word -> 1 uppercase letter (e.g. "Ivana" -> "I").
 * 2+ words -> First and last word initial (e.g. "Player One" -> "RS").
 * Numbers -> "#N" (e.g. 0 -> "#1").
 * @param {string|number} playerName
 * @returns {string}
 */
export function playerInitial(playerName) {
  if (typeof playerName === "number") {
    return `#${playerName + 1}`;
  }
  const clean = String(playerName || "").trim();
  if (!clean) return "?";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const letters = normalizedName(words[0]);
    return (letters[0] || words[0][0] || "?").toUpperCase();
  }
  const first = normalizedName(words[0])[0] || words[0][0] || "";
  const last = normalizedName(words[words.length - 1])[0] || words[words.length - 1][0] || "";
  const initials = (first + last).toUpperCase();
  return initials || "?";
}

export function formatMonth(year, month) {
  if (!year || !month) {
    return t("fmt.no_guess");
  }
  return `${String(month).padStart(2, "0")}/${year}`;
}

export function formatPlace(reveal) {
  if (!reveal) {
    return t("fmt.unknown_place");
  }
  const target = reveal.pinpoint_reveal || reveal;
  // Immich reverse-geocodes assets already, so reuse its labels.
  const parts = [target.actual_city, target.actual_country].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(", ");
  }
  if (
    target.actual_latitude === null ||
    target.actual_latitude === undefined ||
    target.actual_longitude === null ||
    target.actual_longitude === undefined
  ) {
    return t("fmt.unknown_place");
  }
  return `${Number(target.actual_latitude).toFixed(4)}, ${Number(target.actual_longitude).toFixed(4)}`;
}

/**
 * Create a standardized DOM element for a rank badge or number.
 * @param {number|string} rank
 * @param {object} [options]
 * @param {boolean} [options.dot=false]
 * @returns {HTMLSpanElement}
 */
export function createRankBadge(rank, options = {}) {
  const r = parseInt(rank, 10);
  const span = document.createElement("span");
  if (isNaN(r) || r <= 0) {
    span.className = "rank-badge rank-num rank-empty";
    span.textContent = "—";
    return span;
  }
  if (r === 1) {
    span.className = "rank-badge rank-medal rank-1st";
    span.textContent = "1";
    span.setAttribute("title", t("leaderboard.rank_1st"));
  } else if (r === 2) {
    span.className = "rank-badge rank-medal rank-2nd";
    span.textContent = "2";
    span.setAttribute("title", t("leaderboard.rank_2nd"));
  } else if (r === 3) {
    span.className = "rank-badge rank-medal rank-3rd";
    span.textContent = "3";
    span.setAttribute("title", t("leaderboard.rank_3rd"));
  } else {
    span.className = "rank-badge rank-num";
    span.textContent = options.dot ? `${r}.` : `${r}`;
  }
  return span;
}

/**
 * Render a standardized rank badge HTML string for leaderboard and standings tables.
 * @param {number|string} rank
 * @param {object} [options]
 * @param {boolean} [options.dot=false]
 * @returns {string} HTML string
 */
export function formatRankBadge(rank, options = {}) {
  const r = parseInt(rank, 10);
  if (isNaN(r) || r <= 0) {
    return `<span class="rank-badge rank-num rank-empty">—</span>`;
  }
  if (r === 1) {
    return `<span class="rank-badge rank-medal rank-1st" title="${escapeHtml(t("leaderboard.rank_1st"))}">1</span>`;
  }
  if (r === 2) {
    return `<span class="rank-badge rank-medal rank-2nd" title="${escapeHtml(t("leaderboard.rank_2nd"))}">2</span>`;
  }
  if (r === 3) {
    return `<span class="rank-badge rank-medal rank-3rd" title="${escapeHtml(t("leaderboard.rank_3rd"))}">3</span>`;
  }
  const suffix = options.dot ? "." : "";
  return `<span class="rank-badge rank-num">${r}${suffix}</span>`;
}

/**
 * Format a competitive rank or place badge.
 * Returns a styled rank badge or plain text rank.
 * @param {number|string} rank
 * @param {object} [options]
 * @param {boolean} [options.plainText=false] Whether to return unstyled text instead of HTML badge.
 * @param {boolean} [options.dot=false]
 * @returns {string}
 */
export function formatRank(rank, options = {}) {
  const r = parseInt(rank, 10);
  if (isNaN(r) || r <= 0) {
    return "—";
  }
  if (options.plainText) {
    const suffix = options.dot ? "." : "";
    return `${r}${suffix}`;
  }
  return formatRankBadge(r, options);
}

/**
 * Format a challenge rounds completion badge.
 * Standardized across Grand Reveal (#grand-reveal-table) and Challenges Hub (.standings-table).
 * @param {number} completedRounds
 * @param {number} totalRounds
 * @param {boolean} [isFinished=false]
 * @returns {string} HTML string
 */
export function formatRoundsBadge(completedRounds, totalRounds, isFinished = false) {
  const isFin = Boolean(isFinished || (totalRounds && completedRounds >= totalRounds));
  const progressStr = totalRounds ? `${completedRounds}/${totalRounds}` : `${completedRounds}`;
  if (isFin) {
    return `<span class="challenge-rounds-pill finished" title="${escapeHtml(t("challenge.finished_badge"))}">${escapeHtml(progressStr)}</span>`;
  }
  return `<span class="challenge-rounds-pill in-progress" title="${escapeHtml(t("challenge.in_progress_badge"))}">⏳ ${escapeHtml(progressStr)}</span>`;
}

/**
 * Render a standardized player cell HTML string for leaderboard and standings tables.
 * @param {string} playerName
 * @param {object} [options]
 * @param {boolean} [options.isWinner=false]
 * @param {boolean} [options.isCurrent=false]
 * @param {string} [options.awardsHtml=""]
 * @returns {string} HTML string
 */
export function formatPlayerCellHtml(playerName, options = {}) {
  const col = playerColor(playerName);
  const init = playerInitial(playerName);
  const isCurrentUser = Boolean(
    options.isCurrent ||
    (state.auth?.name && playerName && playerName.trim().toLowerCase() === state.auth.name.trim().toLowerCase())
  );
  const badgeCls = isCurrentUser ? "legend-badge is-current-user user-gold-avatar" : "legend-badge";
  const awards = options.awardsHtml ? `<div class="player-awards-list">${options.awardsHtml}</div>` : "";
  const profileLabel = `${t("stats.view_profile")}: ${playerName}`;

  return `
    <span class="player-cell">
      <span class="${badgeCls}" style="background:${escapeHtml(col)};">${escapeHtml(init)}</span>
      <a class="player-name-text player-profile-link" href="/players/${encodeURIComponent(playerName)}" title="${escapeHtml(playerName)}" aria-label="${escapeHtml(profileLabel)}">${escapeHtml(playerName)}</a>
    </span>
    ${awards}
  `;
}

export function formatDistance(km) {
  if (km === null || km === undefined) {
    return "-";
  }
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  if (km < 10) {
    return `${km.toFixed(1)} km`;
  }
  return `${formatNumber(Math.round(km))} km`;
}

export function formatMonthError(result) {
  if (!result) return "-";
  const p = result.pinpoint || result;
  if (p.date_diff_days === null || p.date_diff_days === undefined) {
    return "-";
  }

  let years = p.date_diff_years_part;
  let months = p.date_diff_months_part;
  let days = p.date_diff_days_part;

  if ((years === undefined || months === undefined) && p.guessed_year && p.guessed_month) {
    const actYear = p.actual_year ?? state.lastReveal?.pinpoint_reveal?.actual_year ?? state.lastReveal?.actual_year;
    const actMonth = p.actual_month ?? state.lastReveal?.pinpoint_reveal?.actual_month ?? state.lastReveal?.actual_month;
    if (actYear && actMonth) {
      const diffTotalMonths = Math.abs((p.guessed_year - actYear) * 12 + (p.guessed_month - actMonth));
      years = Math.floor(diffTotalMonths / 12);
      months = diffTotalMonths % 12;
      days = 0;
    }
  }

  if ((years === undefined || months === undefined) && p.date_diff_days !== null && p.date_diff_days !== undefined) {
    if (p.date_diff_days >= 30) {
      const totalMonthsApprox = Math.round(p.date_diff_days / 30.4375);
      years = Math.floor(totalMonthsApprox / 12);
      months = totalMonthsApprox % 12;
      days = 0;
    }
  }

  years = years ?? 0;
  months = months ?? 0;
  days = days ?? p.date_diff_days ?? 0;

  if (years === 0 && months === 0) {
    const dayWord = days === 1 ? t("fmt.day") : t("fmt.days");
    return `${days} ${dayWord}`;
  }

  if (years === 0) {
    if (days === 0) {
      return `${months} ${t("fmt.mon")}`;
    }
    const dayWord = days === 1 ? t("fmt.day") : t("fmt.days");
    return `${months} ${t("fmt.mon")} ${days} ${dayWord}`;
  }

  const yearWord = years === 1 ? t("fmt.year") : t("fmt.years");
  if (months === 0) {
    return `${years} ${yearWord}`;
  }
  return `${years} ${yearWord} ${months} ${t("fmt.mon")}`;
}

export function buildCell(content, isHeader = false) {
  const cell = document.createElement(isHeader ? "th" : "td");
  if (content instanceof Node) {
    cell.appendChild(content);
  } else {
    cell.textContent = content;
  }
  return cell;
}

export function playerBadge(playerName) {
  const badge = document.createElement("span");
  const isCurrentUser = Boolean(
    state.auth?.name &&
    playerName &&
    playerName.trim().toLowerCase() === state.auth.name.trim().toLowerCase()
  );
  badge.className = isCurrentUser ? "legend-badge is-current-user user-gold-avatar" : "legend-badge";
  badge.style.background = playerColor(playerName);
  badge.textContent = playerInitial(playerName);
  return badge;
}

export function playerNameCell(playerName, timedOut = false) {
  const wrap = document.createElement("span");
  wrap.className = "player-cell";
  const nameSpan = document.createElement("span");
  nameSpan.className = "player-name-text";
  nameSpan.textContent = playerName;
  nameSpan.title = playerName;
  wrap.append(playerBadge(playerName), nameSpan);
  if (timedOut) {
    const tag = document.createElement("span");
    tag.className = "timed-out-tag";
    tag.textContent = t("fmt.timed_out_tag");
    wrap.appendChild(tag);
  }
  return wrap;
}

export function renderRoundMeta(container, options = {}) {
  if (!container) return;
  const {
    roundNum,
    totalRounds,
    playerNum,
    totalPlayers = 1,
    playerName,
    isReveal = false,
    showHelp = false,
    onHelpClick = null,
  } = options;

  container._lastMetaOptions = options;
  container.replaceChildren();

  const pillsWrap = document.createElement("div");
  pillsWrap.className = "round-meta-pills";

  // 1. Round Number Pill
  if (roundNum && totalRounds) {
    const roundPill = document.createElement("span");
    roundPill.className = "round-meta-pill round-meta-number";

    const flagSvgWrap = document.createElement("span");
    flagSvgWrap.className = "meta-pill-icon-wrap";
    flagSvgWrap.innerHTML = `<svg class="meta-pill-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>`;

    const roundText = document.createElement("span");
    roundText.className = "round-meta-text";
    roundText.setAttribute("data-i18n", "game.round_label");
    roundText.dataset.i18nArgs = JSON.stringify([roundNum, totalRounds]);
    roundText.textContent = t("game.round_label", roundNum, totalRounds);

    roundPill.append(flagSvgWrap.firstElementChild, roundText);
    pillsWrap.appendChild(roundPill);
  }

  if (isReveal) {
    // 2. Reveal Tag Pill
    const revealPill = document.createElement("span");
    revealPill.className = "round-meta-pill round-meta-reveal-tag";

    const starSvgWrap = document.createElement("span");
    starSvgWrap.className = "meta-pill-icon-wrap";
    starSvgWrap.innerHTML = `<svg class="meta-pill-icon" viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

    const revealText = document.createElement("span");
    revealText.setAttribute("data-i18n", "reveal.badge");
    revealText.textContent = t("reveal.badge");

    revealPill.append(starSvgWrap.firstElementChild, revealText);
    pillsWrap.appendChild(revealPill);
  }

  if (playerName) {
    // Player Info Pill
    const playerPill = document.createElement("span");
    playerPill.className = "round-meta-pill round-meta-player";

    const badge = playerBadge(playerName);
    playerPill.appendChild(badge);

    const playerSpan = document.createElement("span");
    if (!isReveal && totalPlayers > 1) {
      const labelSpan = document.createElement("span");
      labelSpan.setAttribute("data-i18n", "game.player_label");
      labelSpan.dataset.i18nArgs = JSON.stringify([playerNum, ""]);
      labelSpan.textContent = t("game.player_label", playerNum, "") + " ";
      playerSpan.appendChild(labelSpan);
    }
    const strong = document.createElement("strong");
    strong.textContent = playerName;
    playerSpan.appendChild(strong);

    playerPill.appendChild(playerSpan);
    pillsWrap.appendChild(playerPill);
  }

  container.appendChild(pillsWrap);

  if (showHelp) {
    const helpBtn = document.createElement("button");
    helpBtn.type = "button";
    helpBtn.className = "round-meta-help-btn mode-help-btn shuffle-help-btn";
    helpBtn.setAttribute("data-i18n", "game.help_btn");

    const helpIconWrap = document.createElement("span");
    helpIconWrap.className = "meta-pill-icon-wrap";
    helpIconWrap.innerHTML = `<svg class="meta-pill-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

    const textSpan = document.createElement("span");
    textSpan.className = "round-meta-text";
    textSpan.textContent = t("game.help_btn");

    helpBtn.append(helpIconWrap.firstElementChild, textSpan);
    if (onHelpClick) {
      helpBtn.addEventListener("click", onHelpClick);
    }
    container.appendChild(helpBtn);
  }
}

/**
 * Dynamically refresh round meta text whenever language changes.
 * @param {HTMLElement} [container]
 */
export function refreshRoundMeta(container = null) {
  const target = container || document.getElementById("round-meta");
  if (!target || !target._lastMetaOptions) return;
  renderRoundMeta(target, target._lastMetaOptions);
}

/**
 * Format relative duration string from milliseconds.
 * @param {number} diffMs
 * @param {boolean} [isPast=false]
 * @returns {string}
 */
export function formatRelativeTime(diffMs, isPast = false) {
  const absSec = Math.floor(Math.abs(diffMs) / 1000);
  const minutes = Math.floor(absSec / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const dStr = `${days}d ${hours % 24}h`;
    return isPast ? t("challenges_page.expired_relative_ago", dStr) : t("challenges_page.expires_relative_in", dStr);
  }
  if (hours > 0) {
    const hStr = `${hours}h ${minutes % 60}m`;
    return isPast ? t("challenges_page.expired_relative_ago", hStr) : t("challenges_page.expires_relative_in", hStr);
  }
  if (minutes > 0) {
    const mStr = `${minutes}m`;
    return isPast ? t("challenges_page.expired_relative_ago", mStr) : t("challenges_page.expires_relative_in", mStr);
  }
  const sStr = `${absSec}s`;
  return isPast ? t("challenges_page.expired_relative_ago", sStr) : t("challenges_page.expires_relative_in", sStr);
}


