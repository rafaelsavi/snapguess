export const GAME_SETTINGS_STORAGE_KEY = "snapguess_game_settings";

export const DEFAULT_GAME_SETTINGS = Object.freeze({
  game_mode: "pinpoint",
  location_mode: true,
  date_mode: true,
  round_count: "10",
  round_length: "1m",
});

export function normalizeGameSettings(rawSettings = null) {
  const source = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  const gameMode = source.game_mode === "unshuffle" ? "unshuffle" : "pinpoint";

  const locationMode = typeof source.location_mode === "boolean"
    ? source.location_mode
    : DEFAULT_GAME_SETTINGS.location_mode;

  const dateMode = typeof source.date_mode === "boolean"
    ? source.date_mode
    : DEFAULT_GAME_SETTINGS.date_mode;

  const parsedRoundCount = Number.parseInt(String(source.round_count ?? source.roundCount ?? DEFAULT_GAME_SETTINGS.round_count), 10);
  const roundCount = Number.isFinite(parsedRoundCount) && parsedRoundCount > 0
    ? String(parsedRoundCount)
    : DEFAULT_GAME_SETTINGS.round_count;

  const roundLength = typeof source.round_length === "string" && source.round_length.trim()
    ? source.round_length.trim()
    : (typeof source.roundLength === "string" && source.roundLength.trim()
      ? source.roundLength.trim()
      : DEFAULT_GAME_SETTINGS.round_length);

  return {
    game_mode: gameMode,
    location_mode: locationMode,
    date_mode: dateMode,
    round_count: roundCount,
    round_length: roundLength,
  };
}

export function readGameSettings() {
  try {
    const raw = localStorage.getItem(GAME_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GAME_SETTINGS };
    const parsed = JSON.parse(raw);
    return normalizeGameSettings(parsed);
  } catch (e) {
    console.warn("Failed to read game settings from localStorage:", e);
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function writeGameSettings(settings) {
  const normalized = normalizeGameSettings(settings);
  try {
    localStorage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (e) {
    console.warn("Failed to persist game settings to localStorage", e);
    return normalized;
  }
}
