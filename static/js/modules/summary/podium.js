import { el } from "../state.js";
import { t } from "../i18n.js";

export function renderPodium(summary, targetEl = null) {
  const winnerEl = targetEl || el.summaryWinner;
  if (!winnerEl) return;

  const isMultiplayer = summary.players && summary.players.length > 1;
  const isConcluded = summary.is_concluded ?? true;

  let titleText = "";
  if (!isConcluded) {
    if (summary.winners && summary.winners.length > 1) {
      titleText = t("challenge.current_leader_tie", summary.winners.join(" & "));
    } else if (summary.winners && summary.winners.length > 0) {
      titleText = t("challenge.current_leader", summary.winners[0]);
    }
  } else {
    if (summary.winners && summary.winners.length > 1) {
      titleText = t("summary.tie", summary.winners.join(" & "));
    } else if (summary.winners && summary.winners.length > 0) {
      titleText = t("summary.winner", summary.winners[0]);
    }
  }

  winnerEl.replaceChildren();
  const title = document.createElement("div");
  title.className = isConcluded ? "podium-winner-title" : "podium-leader-title";
  title.textContent = titleText;
  winnerEl.appendChild(title);


  // Do not render podium steps in single-player mode
  if (!isMultiplayer) {
    return;
  }

  const top3 = (summary.players || []).slice(0, 3);
  if (top3.length === 0) return;

  const podium = document.createElement("div");
  podium.className = "podium";

  top3.forEach((player, index) => {
    const rank = index + 1;
    const step = document.createElement("div");
    step.className = `podium-step podium-step-${rank}`;

    const medal = document.createElement("div");
    medal.className = `podium-medal podium-badge-${rank}`;
    medal.textContent = `${rank}`;

    const name = document.createElement("a");
    name.className = "podium-name player-profile-link";
    name.href = `/players/${encodeURIComponent(player.player_name)}`;
    const profileLabel = `${t("stats.view_profile")}: ${player.player_name}`;
    name.title = profileLabel;
    name.setAttribute("aria-label", profileLabel);
    name.textContent = player.player_name;

    const score = document.createElement("div");
    score.className = "podium-score";
    score.textContent = t("summary.podium_score", player.total_score);

    step.append(medal, name, score);
    podium.appendChild(step);
  });

  winnerEl.appendChild(podium);
}

