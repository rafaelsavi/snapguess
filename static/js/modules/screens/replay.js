/**
 * Interactive Match Replay Screen & Catalog Controller
 * Replays directory (/replays) and delegation to Unified Match Review Screen (/game/:id/replay).
 */

import { state, el } from "../state.js";
import { t, tOr, formatDateTime } from "../i18n.js";
import { showCard } from "./common.js";
import { navigate, navigateBack } from "../router.js";
import { escapeHtml, playerColor, playerInitial } from "../formatters.js";
import { showMatchSummaryByMatchId, refreshSummaryLanguage } from "./summary.js";
import { copyToClipboard } from "../summary/share.js";
import { setupHubToolbar } from "../components/hub_toolbar.js";

let _listenersBound = false;
let _replaysToolbar = null;
let _replaysSearch = null;

export function initReplay() {
  if (_listenersBound) return;
  _listenersBound = true;

  initReplayCatalog();

  const backBtn = document.getElementById("replay-back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigateBack("/replays");
    });
  }

  const errBackBtn = document.getElementById("replay-error-back-btn");
  if (errBackBtn) {
    errBackBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigateBack("/replays");
    });
  }

  const shareBtn = document.getElementById("replay-share-btn");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const url = window.location.href;
      if (navigator.share && navigator.canShare && navigator.canShare({ url })) {
        try {
          await navigator.share({
            title: tOr("replay.title", "SnapGuess Match Replay"),
            url,
          });
          return;
        } catch (err) {
          if (err && err.name === "AbortError") return;
        }
      }
      await copyToClipboard(url, {
        button: shareBtn,
        successMessage: tOr("summary.share_copied", "Replay link copied to clipboard!"),
      });
    });
  }
}

export { renderReplayTitleHeader } from "./summary.js";

export async function showMatchReplay(matchId) {
  await showMatchSummaryByMatchId(matchId, { mode: "replay" });
}

let _cachedMatches = [];

export function parsePlayerNames(query) {
  if (!query) return [];
  return query
    .split(/[,;]+|\s+[&+]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getFilteredPlayers() {
  const matchPlayerSearch = document.getElementById("stats-replays-player-search");
  return parsePlayerNames(matchPlayerSearch ? matchPlayerSearch.value : "");
}

export function setFilteredPlayers(players, reload = true) {
  const parsed = Array.isArray(players)
    ? players.map((p) => p.trim()).filter(Boolean)
    : parsePlayerNames(players || "");
  if (_replaysSearch) {
    _replaysSearch.setValue(parsed.join(", "), reload);
  } else {
    const matchPlayerSearch = document.getElementById("stats-replays-player-search");
    if (matchPlayerSearch) {
      matchPlayerSearch.value = parsed.join(", ");
    }
    _updateSearchClearBtn();
    if (reload) {
      loadMatchesHistory();
    }
  }
}

export function addFilteredPlayer(name, reload = true) {
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const current = getFilteredPlayers();
  if (!current.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
    current.push(trimmed);
    setFilteredPlayers(current, reload);
  }
}

export function removeFilteredPlayer(name, reload = true) {
  if (!name) return;
  const lower = name.trim().toLowerCase();
  const current = getFilteredPlayers();
  const filtered = current.filter((p) => p.toLowerCase() !== lower);
  setFilteredPlayers(filtered, reload);
}

export function clearFilteredPlayers(reload = true) {
  if (_replaysSearch) {
    _replaysSearch.clear(reload);
  } else {
    const matchPlayerSearch = document.getElementById("stats-replays-player-search");
    if (matchPlayerSearch) {
      matchPlayerSearch.value = "";
    }
    _updateSearchClearBtn();
    if (reload) {
      loadMatchesHistory();
    }
  }
}

function _updateSearchClearBtn() {
  if (_replaysSearch) {
    _replaysSearch.syncClearButton();
    return;
  }
  const matchPlayerSearchClear = document.getElementById("stats-replays-search-clear");
  const matchPlayerSearch = document.getElementById("stats-replays-player-search");
  if (!matchPlayerSearchClear) return;
  const hasInputText = Boolean(matchPlayerSearch && matchPlayerSearch.value.trim());
  matchPlayerSearchClear.classList.toggle("hidden", !hasInputText);
}

export function initReplayCatalog() {
  const matchPlayerSearch = document.getElementById("stats-replays-player-search");
  const matchPlayerSearchClear = document.getElementById("stats-replays-search-clear");

  _replaysToolbar = setupHubToolbar({
    container: ".replays-toolbar",
    search: {
      input: matchPlayerSearch,
      clearBtn: matchPlayerSearchClear,
      debounceMs: 250,
      onSearch: loadMatchesHistory,
      onClear: loadMatchesHistory,
    },
    selects: [
      "stats-replays-mode-filter",
      "stats-replays-type-filter",
      "stats-replays-sort-select",
    ],
    counterBadge: "stats-replays-total-badge",
    onChange: ({ source, data }) => {
      if (source === "select" && data && data.id === "stats-replays-sort-select") {
        renderMatchesHistory(_cachedMatches);
      } else if (source === "select") {
        loadMatchesHistory();
      }
    },
  });
  _replaysSearch = _replaysToolbar.search;

  const refreshBtn = document.getElementById("replays-page-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadMatchesHistory();
    });
  }

  _updateSearchClearBtn();
}

export function showReplaysCatalog(initialPlayer = null) {
  showCard(el.replaysPageCard);

  const heading = document.getElementById("replays-page-heading");
  const desc = document.getElementById("replays-page-desc");

  if (heading) {
    heading.setAttribute("data-i18n", "replay.catalog_title");
    heading.textContent = t("replay.catalog_title");
  }
  if (desc) {
    desc.setAttribute("data-i18n", "replay.catalog_subtitle");
    desc.textContent = t("replay.catalog_subtitle");
  }

  const matchPlayerSearch = document.getElementById("stats-replays-player-search");
  const urlParams = new URLSearchParams(window.location.search);
  const playerParam = initialPlayer !== null ? initialPlayer : (urlParams.get("search") || urlParams.get("player"));
  if (playerParam !== null && matchPlayerSearch) {
    matchPlayerSearch.value = playerParam;
  }
  _updateSearchClearBtn();

  const modeParam = urlParams.get("game_mode") || urlParams.get("mode");
  const matchModeFilter = document.getElementById("stats-replays-mode-filter");
  if (modeParam && matchModeFilter && ["pinpoint", "unshuffle"].includes(modeParam)) {
    matchModeFilter.value = modeParam;
  }

  const typeParam = urlParams.get("play_mode") || urlParams.get("type");
  const matchTypeFilter = document.getElementById("stats-replays-type-filter");
  if (typeParam && matchTypeFilter && ["local", "challenge"].includes(typeParam)) {
    matchTypeFilter.value = typeParam;
  }

  const sortParam = urlParams.get("sort");
  const matchSortSelect = document.getElementById("stats-replays-sort-select");
  if (sortParam && matchSortSelect && ["newest", "oldest", "accuracy", "score", "players"].includes(sortParam)) {
    matchSortSelect.value = sortParam === "score" ? "accuracy" : sortParam;
  }

  loadMatchesHistory();
}

async function loadMatchesHistory() {
  const container = document.getElementById("stats-replays-list");
  if (!container) return;

  const modeSelect = document.getElementById("stats-replays-mode-filter");
  const typeSelect = document.getElementById("stats-replays-type-filter");
  const sortSelect = document.getElementById("stats-replays-sort-select");

  const searchInput = document.getElementById("stats-replays-player-search");
  const searchQuery = searchInput ? searchInput.value.trim() : "";
  const mode = modeSelect && modeSelect.value !== "all" ? modeSelect.value : "";
  const type = typeSelect && typeSelect.value !== "all" ? typeSelect.value : "";
  const sort = sortSelect && sortSelect.value !== "newest" ? sortSelect.value : "";

  // Synchronize URL query parameters without full page reload
  try {
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (mode) params.set("mode", mode);
    if (type) params.set("type", type);
    if (sort) params.set("sort", sort);
    const qs = params.toString();
    const newPath = qs ? `/replays?${qs}` : "/replays";
    if (window.location.pathname === "/replays" && (window.location.search !== (qs ? `?${qs}` : ""))) {
      window.history.replaceState({ path: newPath }, "", newPath);
    }
  } catch (_) {}

  let url = `/api/matches?limit=40`;
  if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
  if (mode) url += `&game_mode=${encodeURIComponent(mode)}`;
  if (type) url += `&play_mode=${encodeURIComponent(type)}`;

  container.innerHTML = `<div class="challenges-loading">${t("common.loading")}</div>`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch matches history");
    _cachedMatches = await res.json();
    renderMatchesHistory(_cachedMatches);
  } catch (err) {
    console.error("Error loading matches:", err);
    container.innerHTML = `<div class="empty-state">${t("replay.empty_matches")}</div>`;
  }
}

function renderMatchesHistory(matches) {
  const container = document.getElementById("stats-replays-list");
  if (!container) return;

  const modeSelect = document.getElementById("stats-replays-mode-filter");
  const typeSelect = document.getElementById("stats-replays-type-filter");
  const sortSelect = document.getElementById("stats-replays-sort-select");

  const searchInput = document.getElementById("stats-replays-player-search");
  const searchQuery = searchInput ? searchInput.value.trim() : "";
  const mode = modeSelect && modeSelect.value !== "all" ? modeSelect.value : "";
  const type = typeSelect && typeSelect.value !== "all" ? typeSelect.value : "";
  const isFiltered = Boolean(searchQuery || mode || type);

  const replaysToolbar = document.querySelector("#replays-page-card .replays-toolbar") ||
    document.querySelector("#replays-page-card .hub-toolbar");
  if (replaysToolbar) {
    replaysToolbar.style.display = (!matches || matches.length === 0) && !isFiltered ? "none" : "";
  }

  const totalBadge = document.getElementById("stats-replays-total-badge");
  if (totalBadge) {
    if (matches && matches.length > 0) {
      totalBadge.textContent = matches.length === 1
        ? t("replay.counter_single", matches.length)
        : t("replay.counter_plural", matches.length);
      totalBadge.classList.remove("hidden");
    } else {
      totalBadge.textContent = t("replay.counter_plural", 0);
      totalBadge.classList.toggle("hidden", !isFiltered);
    }
  }

  if (!matches || matches.length === 0) {
    if (isFiltered) {
      container.innerHTML = `
        <div class="stats-search-empty">
          <p>${t("replay.empty_matches")}</p>
          <button type="button" id="stats-clear-replays-filter-btn" class="btn-secondary btn-sm">
            <span>${t("stats.clear_search")}</span>
          </button>
        </div>
      `;
      document.getElementById("stats-clear-replays-filter-btn")?.addEventListener("click", () => {
        clearFilteredPlayers(false);
        if (modeSelect) modeSelect.value = "all";
        if (typeSelect) typeSelect.value = "all";
        if (sortSelect) sortSelect.value = "newest";
        loadMatchesHistory();
      });
      return;
    }

    container.innerHTML = `
      <div class="stats-empty-guide">
        <div class="stats-empty-icon-wrap" aria-hidden="true">🎬</div>
        <h3 class="stats-empty-title">${t("replay.empty_title")}</h3>
        <p class="stats-empty-desc">${t("replay.empty_desc")}</p>
        <div class="stats-empty-actions">
          <button type="button" id="replay-empty-play-btn" class="btn-primary">
            <span>🎮</span>
            <span>${t("replay.play_match_cta")}</span>
          </button>
          <button type="button" id="replay-empty-challenge-btn" class="btn-secondary">
            <span>⚔️</span>
            <span>${t("stats.browse_challenges_cta")}</span>
          </button>
        </div>
      </div>
    `;

    document.getElementById("replay-empty-play-btn")?.addEventListener("click", () => {
      navigate("/");
    });
    document.getElementById("replay-empty-challenge-btn")?.addEventListener("click", () => {
      navigate("/challenges");
    });
    return;
  }

  const sortBy = sortSelect ? sortSelect.value : "newest";
  const list = [...matches];
  list.sort((a, b) => {
    switch (sortBy) {
      case "oldest": {
        const aTime = a.played_at ? new Date(a.played_at).getTime() : 0;
        const bTime = b.played_at ? new Date(b.played_at).getTime() : 0;
        return aTime - bTime;
      }
      case "accuracy": {
        const aAccuracy = Number(a.top_accuracy_pct) || 0;
        const bAccuracy = Number(b.top_accuracy_pct) || 0;
        return bAccuracy - aAccuracy;
      }
      case "players": {
        const aCount = Number(a.player_count) || (a.players || []).length || 0;
        const bCount = Number(b.player_count) || (b.players || []).length || 0;
        return bCount - aCount;
      }
      case "newest":
      default: {
        const aTime = a.played_at ? new Date(a.played_at).getTime() : 0;
        const bTime = b.played_at ? new Date(b.played_at).getTime() : 0;
        return bTime - aTime;
      }
    }
  });

  container.innerHTML = list
    .map((m) => {
      const modeIcon = m.game_mode === "unshuffle" ? "🔀" : "🎯";
      const modeLabel = m.game_mode === "unshuffle" ? t("mode.unshuffle") : t("mode.pinpoint");
      const isChallenge = m.play_mode === "challenge";
      const typeLabel = isChallenge
        ? t("replay.play_mode_challenge")
        : t("replay.play_mode_local");
      const typeIcon = isChallenge ? "⚔️" : "🕹️";
      const typeClass = isChallenge
        ? " badge-type-challenge"
        : " badge-type-local";
      const modeClass = m.game_mode === "unshuffle"
        ? " badge-mode-unshuffle"
        : " badge-mode-pinpoint";
      const playedStr = m.played_at ? formatDateTime(m.played_at) : "-";
      const winners = Array.isArray(m.winners)
        ? m.winners
        : (m.winner_name ? [m.winner_name] : []);

      const allPlayers = Array.isArray(m.players) ? m.players : [];
      // Put winners first so the winning player chip is prominently featured
      const sortedPlayers = [...allPlayers].sort((a, b) => {
        const aName = typeof a === "string" ? a : (a.player_name || "");
        const bName = typeof b === "string" ? b : (b.player_name || "");
        const aWin = winners.includes(aName) ? 1 : 0;
        const bWin = winners.includes(bName) ? 1 : 0;
        return bWin - aWin;
      });

      const maxVisible = 4;
      const visiblePlayers = sortedPlayers.slice(0, maxVisible);
      const remainingCount = sortedPlayers.length - visiblePlayers.length;
      const remainingNames = sortedPlayers
        .slice(maxVisible)
        .map((p) => (typeof p === "string" ? p : p.player_name || ""))
        .filter(Boolean)
        .join(", ");

      const playersListHtml = visiblePlayers
        .map((p) => {
          const playerName = typeof p === "string" ? p : (p.player_name || "");
          if (!playerName) return "";
          const color = (typeof p === "object" && p.avatar_color)
            ? p.avatar_color
            : playerColor(playerName);
          const initial = playerInitial(playerName);
          const isWinner = winners.includes(playerName) || (typeof p === "object" && p.is_winner);
          const isCurrentUser = Boolean(
            state.auth?.name &&
            playerName &&
            playerName.trim().toLowerCase() === state.auth.name.trim().toLowerCase()
          );
          const scoreInfo = (typeof p === "object" && p.total_score != null) ? ` (${p.total_score} pts)` : "";
          const winnerTooltip = isWinner ? ` 🏆 ${t("replay.winner")}` : "";

          const title = `${escapeHtml(playerName)}${scoreInfo}${winnerTooltip}`;

          return `
            <div class="replay-player-chip${isWinner ? " is-winner" : ""}${isCurrentUser ? " is-current-user" : ""}" title="${escapeHtml(title)}">
              <span class="replay-player-avatar${isCurrentUser ? " is-current-user user-gold-avatar" : ""}" style="background-color: ${color};">${initial}</span>
              <span class="replay-player-name">${escapeHtml(playerName)}</span>
              ${isWinner ? '<span class="replay-winner-crown" aria-hidden="true">👑</span>' : ""}
            </div>
          `;
        })
        .join("") +
        (remainingCount > 0
          ? `<span class="replay-more-players" title="${escapeHtml(remainingNames)}">+${remainingCount}</span>`
          : "");

      return `
        <div class="replay-catalog-item" data-match-id="${escapeHtml(m.match_id)}" role="button" tabindex="0" aria-label="${escapeHtml(modeLabel)} - ${escapeHtml(playedStr)}">
          <div class="replay-item-header">
            <div class="replay-item-badges">
              <span class="badge-tag badge-mode${modeClass}">${modeIcon} ${modeLabel}</span>
              <span class="badge-tag badge-type${typeClass}">${typeIcon} ${typeLabel}</span>
            </div>
            <div class="replay-item-time">${playedStr}</div>
          </div>

          <div class="replay-item-body">
            ${m.challenge_title ? `<div class="replay-item-challenge-title">${escapeHtml(m.challenge_title)}</div>` : ""}
            <div class="replay-item-players">
              ${playersListHtml}
            </div>
          </div>

          <div class="replay-item-footer">
            <span class="replay-action-link">🎬 ${t("replay.watch_replay")}</span>
            <span class="replay-action-arrow" aria-hidden="true">→</span>
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".replay-catalog-item").forEach((item) => {
    const handleActivate = () => {
      const mid = item.getAttribute("data-match-id");
      if (mid) {
        navigate(`/game/${encodeURIComponent(mid)}/replay`);
      }
    };

    item.addEventListener("click", handleActivate);

    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleActivate();
      }
    });
  });
}

/**
 * Refresh replay screen in realtime when language toggle changes.
 */
export function refreshReplayPageLanguage() {
  const replaysCard = el.replaysPageCard || document.getElementById("replays-page-card");
  if (replaysCard && !replaysCard.classList.contains("hidden")) {
    const heading = document.getElementById("replays-page-heading");
    const desc = document.getElementById("replays-page-desc");
    if (heading) {
      heading.setAttribute("data-i18n", "replay.catalog_title");
      heading.textContent = t("replay.catalog_title");
    }
    if (desc) {
      desc.setAttribute("data-i18n", "replay.catalog_subtitle");
      desc.textContent = t("replay.catalog_subtitle");
    }
    const playerSearch = document.getElementById("stats-replays-player-search");
    if (playerSearch) {
      playerSearch.placeholder = t("replay.search_placeholder");
    }
    _updateSearchClearBtn();
    renderMatchesHistory(_cachedMatches);
  }

  refreshSummaryLanguage();
}

