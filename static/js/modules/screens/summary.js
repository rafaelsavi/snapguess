/**
 * Unified Match Review Screen Controller
 *
 * Serves:
 * 1. Mode "summary" (Local Match): Fresh post-game results screen (/game/:id/summary)
 * 2. Mode "summary" (Challenge): Challenge Grand Reveal review (/play/:token/summary)
 * 3. Mode "replay": Historical match archive review screen (/game/:id/replay)
 *
 * Unified architecture:
 * - Outcome Hero (3D Podium, Provisional Status Card, Performance Awards)
 * - Standardized Standings Table with row arrivals and score rollup
 * - Universal 3-Tab Review Deck (Replay, Journey Map, Photo Memories)
 * - Standardized Bottom Actions with Challenge Invite Drawer
 * - All-Time Leaderboard Card
 */

import { state, el, clearActiveMatchSession } from "../state.js";
import { api } from "../api.js";
import { t, getLocale, formatDateTime } from "../i18n.js";
import { navigate, navigateBack } from "../router.js";
import { playVictoryFanfare } from "../audio.js";
import { loadLeaderboard } from "../leaderboard.js";
import { clearTimer } from "../timer.js";
import { renderPodium } from "../summary/podium.js";
import { renderAwards } from "../summary/awards.js";
import { renderSummaryTable } from "../summary/table.js";
import { showCard, clearRevealAnimation } from "./common.js";
import { ReviewDeck } from "../components/review_deck.js";
import { renderMatchMeta } from "../components/match_meta.js";
import { escapeHtml, playerColor } from "../formatters.js";
import { renderShareUrlContainerHtml, setupShareBox } from "../components/share_box.js";
import { challengeSession } from "../challenge/session.js";

let _reviewDeck = null;
let _currentMode = "summary";
let _currentMatchData = null;

export function renderReplayTitleHeader(data = null) {
  const headingTitleEl = document.getElementById("replay-heading-title");
  const titleEl = document.getElementById("replay-match-title");
  if (!titleEl || !data) return;

  if (headingTitleEl) {
    headingTitleEl.setAttribute("data-i18n", "replay.title");
    headingTitleEl.textContent = t("replay.title");
  }

  const isChallenge =
    data.play_mode === "challenge" ||
    Boolean(data.challenge_id || data.challenge_title || data.challenge_creator || data.is_challenge);

  const dateText = data.played_at ? formatDateTime(data.played_at) : "";

  if (isChallenge) {
    const challengeTitle =
      data.challenge_title ||
      data.title ||
      (data.challenge_creator ? `${data.challenge_creator}'s Challenge` : t("challenge.badge"));
    const hostText = data.challenge_creator || data.creator_name
      ? t("challenges_page.host_label", data.challenge_creator || data.creator_name)
      : "";

    const primaryParts = [
      `<span class="badge-tag badge-type badge-type-challenge">⚔️ ${t("replay.play_mode_challenge")}</span>`,
    ];

    const participants = data.players || [];
    const totalRounds = data.rounds || data.total_rounds || 1;
    const finishedCount = participants.filter(
      (p) => p.is_finished || (p.completed_rounds >= totalRounds)
    ).length;

    if (participants.length > 0) {
      primaryParts.push(
        `<span class="challenge-live-pill is-finished"><span class="live-poll-dot is-finished" aria-hidden="true"></span><span>${escapeHtml(t("challenge.live_concluded_tally", finishedCount, participants.length))}</span></span>`
      );
    }

    const detailParts = [];
    if (challengeTitle) {
      detailParts.push(`<span class="replay-challenge-title">${escapeHtml(challengeTitle)}</span>`);
    }
    if (hostText) {
      detailParts.push(`<span class="replay-challenge-host">${escapeHtml(hostText)}</span>`);
    }
    if (dateText) {
      detailParts.push(`<span class="replay-match-date">${escapeHtml(dateText)}</span>`);
    }

    const primaryHtml = `<span class="replay-meta-primary">${primaryParts.join(` <span class="meta-separator" aria-hidden="true">•</span> `)}</span>`;
    const secondaryHtml = detailParts.length > 0
      ? `<span class="replay-meta-secondary">${detailParts.join(` <span class="meta-separator" aria-hidden="true">•</span> `)}</span>`
      : "";

    titleEl.innerHTML = secondaryHtml
      ? `${primaryHtml} <span class="meta-separator replay-meta-break" aria-hidden="true">•</span> ${secondaryHtml}`
      : primaryHtml;

  } else {
    const primaryParts = [
      `<span class="badge-tag badge-type badge-type-local">🕹️ ${t("replay.play_mode_local")}</span>`,
    ];
    if (dateText) {
      primaryParts.push(`<span class="replay-match-date">${escapeHtml(dateText)}</span>`);
    }
    titleEl.innerHTML = `<span class="replay-meta-primary">${primaryParts.join(` <span class="meta-separator" aria-hidden="true">•</span> `)}</span>`;
  }
}

export function renderSummaryTitleHeader(data = null) {
  const badgeEl = el.summaryGameModeBadge || document.getElementById("summary-game-mode-badge");
  const livePill = el.grandRevealLivePill || document.getElementById("grand-reveal-live-pill");
  const liveStatus = el.grandRevealLiveStatus || document.getElementById("grand-reveal-live-status");
  const headingEl = el.summaryHeading || document.getElementById("summary-heading");
  const headingIcon = document.getElementById("summary-heading-icon");
  const backBtn = document.getElementById("summary-back-btn");

  if (!data) return;

  const isChallenge = Boolean(
    data.is_challenge ||
    data.play_mode === "challenge" ||
    data.challenge_id ||
    data.challenge_title ||
    data.challenge_creator
  );

  if (backBtn) {
    backBtn.setAttribute("data-fallback", isChallenge ? "/challenges" : "/");
    if (!backBtn.dataset.listenerAttached) {
      backBtn.dataset.listenerAttached = "true";
      backBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const fallback = backBtn.getAttribute("data-fallback") || "/challenges";
        navigateBack(fallback);
      });
    }
  }

  // Heading is consistently "Game Results" (t("summary.heading"))
  if (headingIcon) {
    headingIcon.textContent = "🏆";
  }
  if (headingEl) {
    headingEl.setAttribute("data-i18n", "summary.heading");
    headingEl.textContent = t("summary.heading");
  }

  const playedAt = data.played_at || _currentMatchData?.played_at;
  const dateText = playedAt ? formatDateTime(playedAt) : "";

  const localDateWrap = document.getElementById("summary-local-date-wrap");
  const localDateEl = document.getElementById("summary-local-match-date");

  const secondaryEl = document.getElementById("summary-meta-secondary");
  const titleEl = document.getElementById("summary-challenge-title");
  const hostSep = document.getElementById("summary-host-sep");
  const hostEl = document.getElementById("summary-challenge-host");
  const dateSep = document.getElementById("summary-date-sep");
  const dateEl = document.getElementById("summary-match-date");
  const metaBreak = document.getElementById("summary-meta-break");

  if (isChallenge) {
    if (badgeEl) {
      badgeEl.className = "badge-tag badge-type badge-type-challenge";
      badgeEl.innerHTML = `⚔️ ${t("replay.play_mode_challenge")}`;
    }

    const totalRounds = data.rounds_played || data.total_rounds || 1;
    const participants = data.players || data.leaderboard || [];
    const isConcluded = Boolean(data.is_concluded);
    if (livePill && liveStatus) {
      livePill.classList.remove("hidden");
      const dotEl = livePill.querySelector(".live-poll-dot");
      const finishedCount = participants.filter(
        (p) => p.is_finished || (p.completed_rounds >= totalRounds)
      ).length;
      if (isConcluded) {
        livePill.classList.add("is-finished");
        if (dotEl) dotEl.classList.add("is-finished");
        liveStatus.textContent = t("challenge.live_concluded_tally", finishedCount, participants.length);
      } else {
        livePill.classList.remove("is-finished");
        if (dotEl) dotEl.classList.remove("is-finished");
        liveStatus.textContent = t("challenge.live_finished_tally", finishedCount, participants.length);
      }
    }

    if (localDateWrap) localDateWrap.classList.add("hidden");

    const challengeTitle =
      data.challenge_title ||
      data.title ||
      (data.challenge_creator || data.creator_name
        ? `${data.challenge_creator || data.creator_name}'s Challenge`
        : t("challenge.badge"));
    const hostText = data.challenge_creator || data.creator_name
      ? t("challenges_page.host_label", data.challenge_creator || data.creator_name)
      : "";

    if (titleEl) {
      titleEl.textContent = challengeTitle;
    }
    if (hostEl) {
      if (hostText) {
        hostEl.textContent = hostText;
        hostEl.classList.remove("hidden");
        if (hostSep) hostSep.classList.remove("hidden");
      } else {
        hostEl.classList.add("hidden");
        if (hostSep) hostSep.classList.add("hidden");
      }
    }
    if (dateEl) {
      if (dateText) {
        dateEl.textContent = dateText;
        dateEl.classList.remove("hidden");
        if (dateSep) dateSep.classList.remove("hidden");
      } else {
        dateEl.classList.add("hidden");
        if (dateSep) dateSep.classList.add("hidden");
      }
    }

    if (secondaryEl) secondaryEl.classList.remove("hidden");
    if (metaBreak) metaBreak.classList.remove("hidden");

  } else {
    if (badgeEl) {
      badgeEl.className = "badge-tag badge-type badge-type-local";
      badgeEl.innerHTML = `🕹️ ${t("replay.play_mode_local")}`;
    }
    if (livePill) {
      livePill.classList.add("hidden");
    }

    if (localDateWrap && localDateEl) {
      if (dateText) {
        localDateEl.textContent = dateText;
        localDateWrap.classList.remove("hidden");
      } else {
        localDateWrap.classList.add("hidden");
      }
    }

    if (secondaryEl) secondaryEl.classList.add("hidden");
    if (metaBreak) metaBreak.classList.add("hidden");
  }
}

export function renderSummaryContent(summary) {
  if (!summary) return;

  // 1. Header (Badge, Title, Meta tally)
  if (_currentMode !== "replay") {
    renderSummaryTitleHeader(summary);
  }

  const isChallenge = Boolean(
    summary.is_challenge ||
    summary.play_mode === "challenge" ||
    summary.challenge_id
  );
  const isSettled = summary.is_settled !== false;
  const isConcluded = Boolean(
    summary.is_concluded ||
    summary.challenge_status === "completed" ||
    summary.challenge_status === "concluded" ||
    summary.is_active === false ||
    (summary.expires_at && new Date() > new Date(summary.expires_at)) ||
    (challengeSession?.challengeData?.is_active === false) ||
    (challengeSession?.challengeData?.expires_at && new Date() > new Date(challengeSession.challengeData.expires_at))
  );
  const finishedPlayers = (summary.players || []).filter(
    (p) => p.is_finished || (typeof summary.total_rounds === "number" && p.completed_rounds >= summary.total_rounds)
  );
  const winners = Array.isArray(summary.winners) ? summary.winners : [];

  // 2. Outcome Hero (Podium, Provisional Card, or Concluded Banners)
  const winnerEl = document.getElementById("summary-winner");
  if (winnerEl) {
    if (isChallenge && !isSettled) {
      winnerEl.innerHTML = `
        <div class="challenge-provisional-card" id="grand-reveal-provisional">
          <div class="provisional-header">
            <span class="pulse-dot"></span>
            <h3 class="provisional-title">${escapeHtml(t("challenge.provisional_title"))}</h3>
          </div>
          <p class="provisional-desc">${escapeHtml(t("challenge.provisional_desc"))}</p>
          <div class="provisional-hint">
            <span aria-hidden="true">🏆</span>
            <span>${escapeHtml(t("challenge.single_player_podium_hint"))}</span>
          </div>
        </div>
      `;
    } else if (isChallenge && isConcluded && winners.length === 0) {
      winnerEl.innerHTML = `
        <div class="challenge-outcome-banner banner-no-winners" id="grand-reveal-no-winners">
          <div class="outcome-banner-header">
            <span class="outcome-banner-icon" aria-hidden="true">🏁</span>
            <h3 class="outcome-banner-title">${escapeHtml(t("challenge.concluded_no_winners_title"))}</h3>
          </div>
          <p class="outcome-banner-desc">${escapeHtml(t("challenge.concluded_no_winners_desc"))}</p>
        </div>
      `;
    } else if (isChallenge && isConcluded && finishedPlayers.length === 1 && winners.length === 1) {
      const winnerName = winners[0];
      const soloPlayer = finishedPlayers[0] || {};
      const score = soloPlayer.total_score || 0;
      winnerEl.innerHTML = `
        <div class="challenge-outcome-banner banner-solo-winner" id="grand-reveal-solo-winner">
          <div class="outcome-banner-header">
            <span class="outcome-banner-icon" aria-hidden="true">🏆</span>
            <h3 class="outcome-banner-title">${escapeHtml(t("challenge.concluded_solo_title"))}</h3>
          </div>
          <p class="outcome-banner-desc">${escapeHtml(t("challenge.concluded_solo_desc", winnerName, score))}</p>
        </div>
      `;
    } else {
      winnerEl.innerHTML = `
        <div class="grand-reveal-podium-wrap" id="grand-reveal-podium-section">
          <div id="grand-reveal-podium" class="summary-winner"></div>
        </div>
      `;
      const podiumEl = document.getElementById("grand-reveal-podium") || winnerEl;
      renderPodium(summary, podiumEl);
      renderAwards(summary, state.playerStats, winnerEl, podiumEl);
    }
  }

  // 3. Standings Table
  renderSummaryTable(summary, state.perfectCounts, {
    currentSessionPlayerName: summary.current_player_name || challengeSession?.sessionPlayerName,
  });

  // 4. Action buttons in summary footer
  const playAgainBtn = document.getElementById("summary-play-again-btn");
  if (playAgainBtn) {
    playAgainBtn.classList.toggle("hidden", Boolean(isChallenge || !state.lastMatchConfig));
  }

  // 5. Challenge Invite Friends Action & Drawer
  const inviteBtn = document.getElementById("challenge-invite-btn");
  const inviteDrawer = document.getElementById("summary-invite-drawer");
  const inviteBox = document.getElementById("summary-invite-share-box");

  if (isChallenge && _currentMode !== "replay" && !isConcluded) {
    if (inviteBtn) {
      inviteBtn.classList.remove("hidden");
      inviteBtn.onclick = () => {
        if (inviteDrawer) {
          inviteDrawer.classList.toggle("hidden");
        }
      };
    }
    const capToken =
      summary.capability_token ||
      challengeSession?.challengeData?.capability_token;
    const playUrl = capToken ? `${window.location.origin}/play/${capToken}` : window.location.href;
    if (inviteBox && (!inviteBox.dataset.ready || inviteBox.dataset.token !== capToken)) {
      inviteBox.innerHTML = renderShareUrlContainerHtml(playUrl, { prefix: "summary-invite" });
      setupShareBox(inviteBox, playUrl, {
        prefix: "summary-invite",
        title: t("challenge.invite_message"),
        qrSize: 180,
      });
      inviteBox.dataset.ready = "true";
      inviteBox.dataset.token = capToken || "";
    }
  } else {
    if (inviteBtn) inviteBtn.classList.add("hidden");
    if (inviteDrawer) inviteDrawer.classList.add("hidden");
  }
}

/**
 * Normalizes match and challenge review data from any source
 * (active challenge session, backend summary response, or historical replay payload)
 * into a single unified summary data model.
 */
export function buildUnifiedSummary({
  matchId = null,
  mode = "summary",
  challengeData = null,
  replayData = null,
  summaryData = null,
} = {}) {
  const isReplay = mode === "replay";
  const isChallenge = Boolean(
    challengeData ||
    summaryData?.is_challenge ||
    summaryData?.play_mode === "challenge" ||
    summaryData?.challenge_id ||
    replayData?.play_mode === "challenge" ||
    replayData?.challenge_id
  );

  const totalRounds =
    challengeData?.total_rounds ||
    summaryData?.total_rounds ||
    summaryData?.rounds_played ||
    replayData?.rounds ||
    (replayData?.rounds_data ? replayData.rounds_data.length : null) ||
    challengeSession?.totalRounds ||
    1;

  // 1. Resolve raw players list
  let rawPlayers = [];
  if (challengeData?.leaderboard && challengeData.leaderboard.length > 0) {
    rawPlayers = challengeData.leaderboard;
  } else if (summaryData?.players && summaryData.players.length > 0) {
    rawPlayers = summaryData.players;
  } else if (replayData?.players && replayData.players.length > 0) {
    rawPlayers = replayData.players;
  } else if (replayData?.rounds_data && replayData.rounds_data.length > 0) {
    const rounds = replayData.rounds_data;
    const lastRound = rounds[rounds.length - 1];
    const guesses = lastRound?.player_guesses || [];
    const playerTotals = new Map();
    rounds.forEach((r) => {
      (r.player_guesses || []).forEach((g) => {
        const cur = playerTotals.get(g.player_name) || { location: 0, date: 0, time: 0 };
        cur.location += (g.location_score || 0);
        cur.date += (g.date_score || 0);
        cur.time += (g.time_taken_seconds || 0);
        playerTotals.set(g.player_name, cur);
      });
    });
    const sorted = [...guesses].sort((a, b) => {
      const scoreDiff = (b.cumulative_score || 0) - (a.cumulative_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const tA = playerTotals.get(a.player_name)?.time ?? 0;
      const tB = playerTotals.get(b.player_name)?.time ?? 0;
      if (tA !== tB) return tA - tB;
      return a.player_name.localeCompare(b.player_name);
    });

    const isUnshuffle = (replayData?.game_mode || "").toLowerCase().includes("unshuffle");
    const activeGoals = (replayData?.location_mode !== false ? 1 : 0) + (replayData?.date_mode !== false ? 1 : 0);
    const roundMaxScore = isUnshuffle ? (activeGoals * 100) : (activeGoals * 5000);
    const computedMaxScore = Math.max(1, totalRounds * roundMaxScore);

    rawPlayers = sorted.map((g, idx) => {
      const totals = playerTotals.get(g.player_name) || { location: g.location_score, date: g.date_score };
      const isFin = rounds.length >= totalRounds;
      const totScore = g.cumulative_score || 0;
      const acc = computedMaxScore > 0 ? Math.round((totScore / computedMaxScore) * 1000) / 10 : 0;
      return {
        player_name: g.player_name,
        total_score: totScore,
        location_score: totals.location,
        date_score: totals.date,
        rank: idx + 1,
        completed_rounds: rounds.length,
        is_finished: isFin,
        is_winner: idx === 0 && totScore > 0 && isFin,
        max_possible_score: computedMaxScore,
        accuracy_pct: acc,
      };
    });
  }

  // 2. Normalize player entries
  const players = rawPlayers.map((p, idx) => {
    const name = typeof p === "string" ? p : p.player_name;
    const score = (typeof p === "object" && p.total_score != null) ? p.total_score : 0;
    const isFinished = (typeof p === "object" && p.is_finished != null)
      ? Boolean(p.is_finished)
      : (isChallenge
          ? Boolean(p.completed_rounds != null && p.completed_rounds >= totalRounds)
          : true);
    const completedRounds = (typeof p === "object" && p.completed_rounds != null)
      ? p.completed_rounds
      : (isFinished ? totalRounds : (replayData?.rounds_data?.length || 0));

    return {
      player_name: name,
      total_score: score,
      location_score: typeof p === "object" ? p.location_score : null,
      date_score: typeof p === "object" ? p.date_score : null,
      rank: (typeof p === "object" && p.rank) ? p.rank : (idx + 1),
      max_possible_score: (typeof p === "object" && p.max_possible_score) ? p.max_possible_score : (totalRounds * 10000),
      accuracy_pct: typeof p === "object" ? (p.accuracy_pct ?? p.accuracy_percentage ?? null) : null,
      accuracy_percentage: typeof p === "object" ? (p.accuracy_pct ?? p.accuracy_percentage ?? null) : null,
      avatar_color: typeof p === "object" ? (p.avatar_color || playerColor(name)) : playerColor(name),
      completed_rounds: completedRounds,
      is_finished: isFinished,
      is_winner: Boolean(typeof p === "object" && p.is_winner),
    };
  });

  const finishedPlayers = players.filter((p) => p.is_finished || p.completed_rounds >= totalRounds);

  // 3. Determine concluded & settled states
  // Replays and finished local matches are always concluded.
  // Live challenges check challengeData/session flags.
  const isConcluded = isReplay || !challengeData || Boolean(
    challengeData.is_concluded ||
    challengeSession?.challengeData?.is_active === false ||
    (challengeSession?.challengeData?.expires_at && new Date() > new Date(challengeSession.challengeData.expires_at))
  );

  const isSettled = finishedPlayers.length >= 2 || isConcluded;

  // 4. Resolve qualified winners (>0 points only)
  let winners = [];
  const explicitWinners = challengeData?.winners ?? summaryData?.winners ?? replayData?.winners;
  if (Array.isArray(explicitWinners)) {
    winners = explicitWinners.filter((wName) => {
      const pl = players.find((p) => p.player_name === wName);
      return pl ? pl.total_score > 0 : true;
    });
  } else {
    winners = finishedPlayers
      .filter((p) => p.is_winner && p.total_score > 0)
      .map((p) => p.player_name);
    if (winners.length === 0 && finishedPlayers.length > 0 && isSettled) {
      const topScorer = [...finishedPlayers].sort((a, b) => b.total_score - a.total_score)[0];
      if (topScorer && topScorer.total_score > 0) {
        winners = [topScorer.player_name];
      }
    }
  }

  // Synchronize is_winner flag across players
  players.forEach((p) => {
    p.is_winner = winners.includes(p.player_name);
  });

  const challengeTitle =
    challengeData?.title ||
    replayData?.challenge_title ||
    summaryData?.challenge_title ||
    (challengeData?.creator_name ? `${challengeData.creator_name}'s Challenge` : null) ||
    (replayData?.challenge_creator ? `${replayData.challenge_creator}'s Challenge` : null) ||
    (summaryData?.challenge_creator ? `${summaryData.challenge_creator}'s Challenge` : null) ||
    challengeSession?.challengeData?.title ||
    null;

  const challengeCreator =
    challengeData?.creator_name ||
    replayData?.challenge_creator ||
    summaryData?.challenge_creator ||
    challengeSession?.challengeData?.creator_name ||
    null;

  return {
    match_id: matchId || replayData?.match_id || summaryData?.match_id || challengeData?.challenge_id,
    played_at: replayData?.played_at || summaryData?.played_at || null,
    is_challenge: isChallenge,
    play_mode: isChallenge ? "challenge" : (replayData?.play_mode || summaryData?.play_mode || "classic"),
    challenge_id: challengeData?.challenge_id || replayData?.challenge_id || summaryData?.challenge_id || challengeSession?.challengeData?.challenge_id || null,
    challenge_title: challengeTitle,
    challenge_creator: challengeCreator,
    capability_token: challengeData?.capability_token || summaryData?.capability_token || challengeSession?.challengeData?.capability_token || null,
    game_mode: challengeData?.game_mode || replayData?.game_mode || summaryData?.game_mode || "pinpoint",
    location_mode: challengeData ? (challengeData.location_mode !== false) : (replayData?.location_mode ?? summaryData?.location_mode ?? true),
    date_mode: challengeData ? (challengeData.date_mode !== false) : (replayData?.date_mode ?? summaryData?.date_mode ?? true),
    rounds_played: totalRounds,
    total_rounds: totalRounds,
    max_possible_score: totalRounds * 10000,
    players,
    winners,
    is_settled: isSettled,
    is_concluded: isConcluded,
    current_player_name: challengeSession?.sessionPlayerName || null,
    round_history: replayData?.rounds_data || summaryData?.round_history || challengeData?.round_history || [],
    round_guesses: challengeData?.round_guesses || [],
    config: challengeData?.config || replayData?.config || summaryData?.config || challengeSession?.challengeData?.config,
    filter_summary: challengeData?.config?.filter_summary || replayData?.filter_summary || summaryData?.filter_summary || null,
    filter_tooltip: challengeData?.config?.filter_tooltip || replayData?.filter_tooltip || summaryData?.filter_tooltip || null,
  };
}

export function replayToSummary(replayData) {
  return buildUnifiedSummary({
    matchId: replayData?.match_id,
    mode: "replay",
    replayData,
  });
}

export async function showMatchSummary() {
  if (!state.matchId) return;
  await showMatchSummaryByMatchId(state.matchId, { mode: "summary", playFanfare: true });
}

export async function showMatchSummaryByMatchId(
  matchId,
  {
    mode = "summary",
    playFanfare = false,
    isChallenge = false,
    challengeData = null,
  } = {}
) {
  _currentMode = mode;
  state.matchId = matchId;

  const headerSummary = document.getElementById("review-header-summary");
  const headerReplay = document.getElementById("review-header-replay");
  const actionsSummary = document.getElementById("summary-actions");
  const actionsReplay = document.getElementById("replay-actions");
  const loadingEl = document.getElementById("replay-loading-state");
  const errorEl = document.getElementById("replay-error-state");
  const reviewContent = document.getElementById("review-content");

  if (loadingEl) loadingEl.classList.add("hidden");
  if (errorEl) errorEl.classList.add("hidden");
  if (reviewContent) reviewContent.classList.remove("hidden");

  if (mode === "replay") {
    if (headerSummary) headerSummary.classList.add("hidden");
    if (headerReplay) headerReplay.classList.remove("hidden");
    if (actionsSummary) actionsSummary.classList.add("hidden");
    if (actionsReplay) actionsReplay.classList.remove("hidden");
    state.activeLeaderboardConfig = null;
    if (el.leaderboardCard) el.leaderboardCard.classList.add("hidden");
  } else {
    if (headerSummary) headerSummary.classList.remove("hidden");
    if (headerReplay) headerReplay.classList.add("hidden");
    if (actionsSummary) actionsSummary.classList.remove("hidden");
    if (actionsReplay) actionsReplay.classList.add("hidden");
  }

  showCard(el.summaryCard);
  window.scrollTo({ top: 0, behavior: "smooth" });

  const lang = getLocale();
  let summary = null;
  let replayData = null;
  let summaryData = null;

  if (mode === "replay") {
    if (loadingEl) loadingEl.classList.remove("hidden");
    if (reviewContent) reviewContent.classList.add("hidden");

    try {
      const res = await fetch(`/api/match/${encodeURIComponent(matchId)}/replay`);
      if (!res.ok) throw new Error("Failed to load match replay");
      replayData = await res.json();
      _currentMatchData = replayData;

      try {
        summaryData = await api(`/api/match/${encodeURIComponent(matchId)}/summary?lang=${encodeURIComponent(lang)}`);
      } catch (_) {}

      summary = buildUnifiedSummary({
        matchId,
        mode: "replay",
        replayData,
        summaryData,
      });

      if (loadingEl) loadingEl.classList.add("hidden");
      if (reviewContent) reviewContent.classList.remove("hidden");

      renderReplayTitleHeader(summary);
      const metaContainer = document.getElementById("replay-match-meta-container");
      if (metaContainer) {
        renderMatchMeta(metaContainer, replayData || summary);
      }
    } catch (err) {
      console.error("Error loading match replay:", err);
      if (loadingEl) loadingEl.classList.add("hidden");
      if (reviewContent) reviewContent.classList.add("hidden");
      if (errorEl) {
        errorEl.classList.remove("hidden");
        const errText = document.getElementById("replay-error-text");
        if (errText) errText.textContent = t("replay.not_found");
      }
      return;
    }
  } else if (challengeData) {
    // Mode: Challenge Summary
    if (matchId) {
      try {
        const replayRes = await fetch(`/api/match/${encodeURIComponent(matchId)}/replay`);
        if (replayRes.ok) {
          replayData = await replayRes.json();
          _currentMatchData = replayData;
        }
      } catch (_) {}
    }

    summary = buildUnifiedSummary({
      matchId,
      mode: "summary",
      challengeData,
      replayData,
    });

    if (playFanfare) {
      playVictoryFanfare();
    }

    if (el.leaderboardCard) {
      if (state.auth?.role === "creator") {
        el.leaderboardCard.classList.remove("hidden");
        await loadLeaderboard(summary);
      } else {
        el.leaderboardCard.classList.add("hidden");
      }
    }
  } else {
    // Mode: Local Match Summary
    try {
      summaryData = await api(
        `/api/match/${encodeURIComponent(matchId)}/summary?lang=${encodeURIComponent(lang)}`
      );
      if (summaryData && !summaryData.finished) {
        showGameEndedCard(
          null,
          t("game_ended.match_in_progress_msg"),
          t("game_ended.match_in_progress_title"),
          "🎮"
        );
        return;
      }

      try {
        const replayRes = await fetch(`/api/match/${encodeURIComponent(matchId)}/replay`);
        if (replayRes.ok) {
          replayData = await replayRes.json();
          _currentMatchData = replayData;
        }
      } catch (_) {}

      summary = buildUnifiedSummary({
        matchId,
        mode: "summary",
        summaryData,
        replayData,
      });

      if (playFanfare) {
        playVictoryFanfare();
      }

      if (el.leaderboardCard) {
        if (state.auth?.role === "creator") {
          el.leaderboardCard.classList.remove("hidden");
          await loadLeaderboard(summary);
        } else {
          el.leaderboardCard.classList.add("hidden");
        }
      }
    } catch (err) {
      console.warn("Failed to load match summary:", err);
      showGameEndedCard(
        null,
        t("game_ended.match_not_found_msg", matchId),
        t("game_ended.match_not_found_title"),
        "🔍"
      );
      return;
    }
  }

  if (el.summaryCard) {
    el.summaryCard.classList.toggle("challenge-grand-reveal", Boolean(summary?.is_challenge));
  }

  state.lastSummary = summary;
  if (summary.round_history && summary.round_history.length > 0) {
    state.roundHistory = summary.round_history;
  }

  // Render Outcome Hero (Podium / Provisional, Standings Table, Awards)
  if (summary) {
    renderSummaryContent(summary);
  }

  // Mount & Hydrate Universal Review Deck
  const deckMount = document.getElementById("summary-review-deck");
  if (deckMount) {
    if (!_reviewDeck) {
      _reviewDeck = new ReviewDeck(deckMount, {
        showReportButton: true,
        defaultTab: "replay",
      });
    }
    const deckPayload = replayData || summary;
    _reviewDeck.setMatchData(deckPayload, 0);
  }
}

export function showGameEndedCard(matchId = null, customMsg = null, customTitle = null, customIcon = null) {
  clearRevealAnimation();
  clearTimer();
  clearActiveMatchSession();

  showCard(el.gameEndedCard);
  state.activeLeaderboardConfig = null;
  if (el.leaderboardCard) el.leaderboardCard.classList.add("hidden");

  const iconEl = document.getElementById("game-ended-icon");
  if (iconEl) {
    iconEl.textContent = customIcon ?? "🏁";
  }

  const titleEl = document.getElementById("game-ended-title");
  if (titleEl) {
    titleEl.textContent = customTitle ?? t("game_ended.heading");
  }

  const msgEl = document.getElementById("game-ended-msg");
  if (msgEl) {
    msgEl.textContent = customMsg ?? t("game_ended.message");
  }

  if (el.gameEndedSummaryBtn) {
    if (matchId) {
      el.gameEndedSummaryBtn.classList.remove("hidden");
      el.gameEndedSummaryBtn.onclick = () => {
        navigate(`/game/${encodeURIComponent(matchId)}/summary`);
      };
    } else {
      el.gameEndedSummaryBtn.classList.add("hidden");
    }
  }

  if (el.gameEndedLobbyBtn) {
    el.gameEndedLobbyBtn.onclick = () => {
      navigate("/");
    };
  }
}

export function refreshSummaryLanguage() {
  if (el.summaryCard && !el.summaryCard.classList.contains("hidden")) {
    if (state.lastSummary) {
      renderSummaryContent(state.lastSummary);
    }
    if (_reviewDeck) {
      _reviewDeck.refreshLanguage();
    }
    if (_currentMode === "replay" && _currentMatchData) {
      renderReplayTitleHeader(_currentMatchData);
      const metaContainer = document.getElementById("replay-match-meta-container");
      if (metaContainer) {
        renderMatchMeta(metaContainer, _currentMatchData);
      }
      const backBtn = document.getElementById("replay-back-btn");
      if (backBtn) {
        const span = backBtn.querySelector("[data-i18n]");
        if (span) span.textContent = t("common.back");
      }
      const sumBackBtn = document.getElementById("summary-back-btn");
      if (sumBackBtn) {
        const span = sumBackBtn.querySelector("[data-i18n]");
        if (span) span.textContent = t("common.back");
      }
    }
  }
}
