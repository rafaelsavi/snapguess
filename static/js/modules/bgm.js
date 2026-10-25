import { state } from "./state.js";
import { getAudioContext, hasUserActivation, unlockAudioContext } from "./audio.js";

/**
 * @typedef {"idle" | "lobby" | "game" | "tension" | "reveal" | "summary"} BgmMood
 */

let bgmGainNode = null;
let bgmFilterNode = null;
let schedulerTimerId = null;
let currentMood = "idle";
let nextStepTime = 0;
let stepIndex = 0;
let activeChordOscs = [];

// Base tempo and rhythmic subdivision settings
const LOBBY_BPM = 58;
const GAME_BPM = 72;
const TENSION_BPM = 84;

// Target volumes for each mood
const MOOD_VOLUMES = {
  idle: 0.0001,
  lobby: 0.045,
  game: 0.040,
  tension: 0.055,
  reveal: 0.0001,
  summary: 0.0001,
};

// Target filter cutoffs (Hz) for warm lo-fi aesthetic vs tense opening
const MOOD_CUTOFFS = {
  idle: 600,
  lobby: 650,
  game: 950,
  tension: 2200,
  reveal: 500,
  summary: 600,
};

// Lush ambient chord progression for Lobby (Cmaj7 -> Am9 -> Fmaj7 -> Gsus4/G)
const LOBBY_CHORDS = [
  // Cmaj7 (C3, G3, B3, E4)
  [130.81, 196.0, 246.94, 329.63],
  // Am9 (A2, E3, G3, C4, B4)
  [110.0, 164.81, 196.0, 261.63, 493.88],
  // Fmaj7 (F2, C3, A3, E4)
  [87.31, 130.81, 220.0, 329.63],
  // Gsus4 -> G (G2, D3, G3, C4/B3)
  [98.0, 146.83, 196.0, 246.94],
];

// Marimba / Focus arpeggio notes for Active Game Round
const GAME_ARPEGGIO = [
  { note: 261.63, dur: 0.22, bass: 130.81 }, // C4, bass C3
  { note: 329.63, dur: 0.20, bass: null },   // E4
  { note: 392.0,  dur: 0.22, bass: null },   // G4
  { note: 493.88, dur: 0.25, bass: null },   // B4
  { note: 440.0,  dur: 0.22, bass: 110.0 },  // A4, bass A2
  { note: 392.0,  dur: 0.20, bass: null },   // G4
  { note: 329.63, dur: 0.22, bass: null },   // E4
  { note: 293.66, dur: 0.25, bass: null },   // D4
  { note: 220.0,  dur: 0.22, bass: 87.31 },  // A3, bass F2
  { note: 261.63, dur: 0.20, bass: null },   // C4
  { note: 329.63, dur: 0.22, bass: null },   // E4
  { note: 440.0,  dur: 0.25, bass: null },   // A4
  { note: 392.0,  dur: 0.22, bass: 98.0 },   // G4, bass G2
  { note: 293.66, dur: 0.20, bass: null },   // D4
  { note: 246.94, dur: 0.22, bass: null },   // B3
  { note: 196.0,  dur: 0.28, bass: null },   // G3
];

// Tense pulsing step notes for Last 10s of Round
const TENSION_STEPS = [
  { root: 65.41, arp: 261.63 }, // C2 sub, C4
  { root: null,  arp: 311.13 }, // Eb4 (minor tension)
  { root: 58.27, arp: 233.08 }, // Bb1 sub, Bb3
  { root: null,  arp: 293.66 }, // D4
  { root: 61.74, arp: 246.94 }, // B1 sub, B3
  { root: null,  arp: 329.63 }, // E4
  { root: 65.41, arp: 392.0 },  // C2 sub, G4
  { root: null,  arp: 493.88 }, // B4
];

/**
 * Ensures the procedural BGM gain and filter routing chain is created.
 */
function ensureBgmNodes() {
  const ctx = getAudioContext();
  if (!ctx) return null;

  if (!bgmGainNode) {
    try {
      bgmFilterNode = ctx.createBiquadFilter();
      bgmFilterNode.type = "lowpass";
      bgmFilterNode.frequency.setValueAtTime(MOOD_CUTOFFS[currentMood] || 700, ctx.currentTime);
      bgmFilterNode.Q.setValueAtTime(1.2, ctx.currentTime);

      bgmGainNode = ctx.createGain();
      const initialGain = state.musicEnabled && currentMood !== "idle" && currentMood !== "reveal" && currentMood !== "summary"
        ? (MOOD_VOLUMES[currentMood] || 0.045)
        : 0.0001;
      bgmGainNode.gain.setValueAtTime(initialGain, ctx.currentTime);

      bgmFilterNode.connect(bgmGainNode);
      bgmGainNode.connect(ctx.destination);
    } catch (_) {
      return null;
    }
  }

  return bgmGainNode;
}

/**
 * Cleanly stops any active sustaining chord oscillators.
 */
function stopActiveChords(fadeDuration = 0.5) {
  const ctx = getAudioContext();
  if (!ctx || !activeChordOscs.length) return;

  const stopTime = ctx.currentTime + fadeDuration;
  activeChordOscs.forEach(({ osc, gain }) => {
    try {
      gain.gain.linearRampToValueAtTime(0.0001, stopTime);
      osc.stop(stopTime + 0.05);
    } catch (_) {}
  });
  activeChordOscs = [];
}

/**
 * Schedules a warm sustained chord for the Lobby mood.
 */
function scheduleLobbyChord(time, chordNotes, duration) {
  const ctx = getAudioContext();
  if (!ctx || !bgmFilterNode) return;

  chordNotes.forEach((freq, idx) => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      // Gentle micro-detuning (+3/-3 cents) for analog chorus texture
      const detune = idx % 2 === 0 ? 3.5 : -3.5;
      osc.frequency.setValueAtTime(freq, time);
      osc.detune.setValueAtTime(detune, time);

      // Soft envelope: slow fade-in, smooth release
      const noteGain = 0.038 / chordNotes.length;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(noteGain, time + 0.8);
      gain.gain.setValueAtTime(noteGain, time + duration - 0.7);
      gain.gain.linearRampToValueAtTime(0.0001, time + duration);

      osc.connect(gain);
      gain.connect(bgmFilterNode);

      osc.start(time);
      osc.stop(time + duration);

      activeChordOscs.push({ osc, gain });
    } catch (_) {}
  });
}

/**
 * Schedules a delicate marimba/bell pluck note for the Game mood.
 */
function schedulePluck(time, freq, duration, isBass = false) {
  const ctx = getAudioContext();
  if (!ctx || !bgmFilterNode) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isBass ? "sine" : "triangle";
    osc.frequency.setValueAtTime(freq, time);

    const peakGain = isBass ? 0.035 : 0.026;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(peakGain, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(bgmFilterNode);

    osc.start(time);
    osc.stop(time + duration);
  } catch (_) {}
}

/**
 * Schedules a tense heartbeat pulse on seconds countdown.
 */
function scheduleTensionPulse(time, rootFreq, arpFreq) {
  const ctx = getAudioContext();
  if (!ctx || !bgmFilterNode) return;

  // 1. Sub heartbeat thump
  if (rootFreq) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(rootFreq * 1.1, time);
      osc.frequency.exponentialRampToValueAtTime(rootFreq * 0.8, time + 0.12);

      gain.gain.setValueAtTime(0.05, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);

      osc.connect(gain);
      gain.connect(bgmFilterNode);

      osc.start(time);
      osc.stop(time + 0.16);
    } catch (_) {}
  }

  // 2. High clockwork tick
  if (arpFreq) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(arpFreq, time);

      gain.gain.setValueAtTime(0.024, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);

      osc.connect(gain);
      gain.connect(bgmFilterNode);

      osc.start(time);
      osc.stop(time + 0.09);
    } catch (_) {}
  }
}

/**
 * Main Web Audio lookahead scheduler loop.
 */
function schedulerLoop() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running" || !state.musicEnabled) {
    return;
  }

  // Look ahead window (0.12s)
  const scheduleAheadTime = 0.12;

  while (nextStepTime < ctx.currentTime + scheduleAheadTime) {
    if (currentMood === "lobby") {
      const chordIndex = stepIndex % LOBBY_CHORDS.length;
      const duration = (60 / LOBBY_BPM) * 3.2; // ~3.3 seconds per chord
      scheduleLobbyChord(nextStepTime, LOBBY_CHORDS[chordIndex], duration);
      nextStepTime += duration;
      stepIndex++;
    } else if (currentMood === "game") {
      const step = GAME_ARPEGGIO[stepIndex % GAME_ARPEGGIO.length];
      const stepDuration = (60 / GAME_BPM) * 0.5; // Eighth note step
      schedulePluck(nextStepTime, step.note, step.dur);
      if (step.bass) {
        schedulePluck(nextStepTime, step.bass, 0.45, true);
      }
      nextStepTime += stepDuration;
      stepIndex++;
    } else if (currentMood === "tension") {
      const step = TENSION_STEPS[stepIndex % TENSION_STEPS.length];
      const stepDuration = (60 / TENSION_BPM) * 0.5;
      scheduleTensionPulse(nextStepTime, step.root, step.arp);
      nextStepTime += stepDuration;
      stepIndex++;
    } else {
      // Idle or silent mood: advance time
      nextStepTime = ctx.currentTime + 0.2;
      break;
    }
  }
}

/**
 * Starts the lookahead scheduler interval.
 */
function startScheduler() {
  if (schedulerTimerId !== null) return;
  const ctx = getAudioContext();
  if (ctx) {
    nextStepTime = ctx.currentTime + 0.05;
  }
  stepIndex = 0;
  schedulerTimerId = setInterval(schedulerLoop, 40);
}

/**
 * Stops the lookahead scheduler interval.
 */
function stopScheduler() {
  if (schedulerTimerId !== null) {
    clearInterval(schedulerTimerId);
    schedulerTimerId = null;
  }
  stopActiveChords(0.3);
}

/**
 * Smoothly transitions the procedural BGM to the requested mood.
 * @param {BgmMood} newMood
 */
export function setBgmMood(newMood) {
  if (currentMood === newMood) return;

  const prevMood = currentMood;
  currentMood = newMood;

  ensureBgmNodes();
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;

  const targetVol = state.musicEnabled ? (MOOD_VOLUMES[newMood] || 0.0001) : 0.0001;
  const targetCutoff = MOOD_CUTOFFS[newMood] || 700;

  try {
    // Smooth filter cutoff transition
    bgmFilterNode.frequency.cancelScheduledValues(ctx.currentTime);
    bgmFilterNode.frequency.linearRampToValueAtTime(targetCutoff, ctx.currentTime + 0.4);

    // Smooth gain transition
    bgmGainNode.gain.cancelScheduledValues(ctx.currentTime);
    bgmGainNode.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.35);
  } catch (_) {}

  // If transitioning out of lobby, fade lingering pad chords
  if (prevMood === "lobby" && newMood !== "lobby") {
    stopActiveChords(0.4);
  }

  if (newMood === "idle" || newMood === "reveal" || newMood === "summary") {
    stopScheduler();
  } else {
    // Reset step time cleanly on mood shift
    nextStepTime = ctx.currentTime + 0.08;
    stepIndex = 0;
    startScheduler();
  }
}

/**
 * Toggles or updates the background music master gain node.
 * @param {boolean} isEnabled
 */
export function setMusicEnabled(isEnabled) {
  ensureBgmNodes();
  const ctx = getAudioContext();
  if (!ctx || !bgmGainNode) return;

  const targetVol = isEnabled ? (MOOD_VOLUMES[currentMood] || 0.045) : 0.0001;

  try {
    bgmGainNode.gain.cancelScheduledValues(ctx.currentTime);
    bgmGainNode.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.3);
  } catch (_) {}

  if (isEnabled && currentMood !== "idle" && currentMood !== "reveal" && currentMood !== "summary") {
    startScheduler();
  } else if (!isEnabled) {
    stopScheduler();
  }
}

/**
 * Returns current active BGM mood name.
 * @returns {BgmMood}
 */
export function getBgmMood() {
  return currentMood;
}

/**
 * Initializes BGM state on user interaction unlock.
 */
export function onAudioUnlocked() {
  ensureBgmNodes();
  if (state.musicEnabled && currentMood !== "idle") {
    setMusicEnabled(true);
  }
}
