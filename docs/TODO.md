# SnapGuess Roadmap & TODO List

This document lists planned features, design ideas, and technical debt items for **SnapGuess**, sorted by implementation priority and dependencies.

---

## 🚀 Prioritized TODO List

- [ ] Add real website popups to replace the current browser based alert/confirm/prompt dialogues to work well with PWA. (If you see some popups that you think should remain as brwoser dialogue, feel free to tell me)
- [x] Creators should be able to see a button to recreate an existing challenge. (The game mode and library selection should be remembered.)
- [ ] **Improve Audio Effects & Soundtrack**
  - [ ] Expand runtime Web Audio synthesized procedural background music with game state mood transitions (setup -> tense round -> victory fanfare).
  - [ ] Add transitional sound cues (whoosh screen transitions, high-score chimes, round buzzer variations).
  - [ ] Add volume sliders and audio mute/unmute toggles in settings.
  - [ ] Keep [`static/audio-playground.html`](../static/audio-playground.html) updated with new synth sound design tools.
