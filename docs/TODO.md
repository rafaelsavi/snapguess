# SnapGuess Roadmap & TODO List

This document lists planned features, design ideas, and technical debt items for **SnapGuess**, sorted by implementation priority and dependencies.

---

## 🚀 Prioritized TODO List

- [x] col-rank of recent-matches-card is always showing first place even when it's wrong
- [x] button "replay-back-btn" doesnt make sense if I arrived to the page from the another page that is not the replay page. Think about a better general strategy for back buttons.
- [x] Standardize review-header-summary, review-header-replay, and player profile headers with unified layout and back navigation.
- [x] Change satellite to hybrid maps
- [ ] Discard support for videos. You can simplify whatever feels necessary, for example the query to immich.
- [ ] **Improve Audio Effects & Soundtrack**
  - [ ] Expand runtime Web Audio synthesized procedural background music with game state mood transitions (setup -> tense round -> victory fanfare).
  - [ ] Add transitional sound cues (whoosh screen transitions, high-score chimes, round buzzer variations).
  - [ ] Add volume sliders and audio mute/unmute toggles in settings.
  - [ ] Keep [`static/audio-playground.html`](../static/audio-playground.html) updated with new synth sound design tools.
