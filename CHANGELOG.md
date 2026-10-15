# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **1-Click Challenge Recreation for Creators**: Creators can now quickly recreate concluded challenges directly from the Challenges Hub, match results, and replay screens. Recreating restores the original game mode (Pinpoint or Unshuffle), Immich library selection, and photo filter criteria into the creator setup modal, allowing instant generation of a new challenge seed once an event has finished.
- **Concluded Challenge Outcome Banners**: Added dedicated summary banners on the Grand Reveal and Match Review screens when a challenge concludes with no winning scores or with a solo participant, providing clear confirmation of the final result.
- **Concluded Challenge Status Indicator**: Concluded challenges now display a neutral, non-pulsing status badge and dot on match review screens, distinguishing completed events from actively running multiplayer lobbies.

### Changed

- **Photo-Only Discovery & Trivia**: Streamlined library synchronization and gameplay to focus exclusively on photos and still memories, optimizing question selection, preview loading speeds, and overall responsiveness.
- **Minimum Immich Server Requirement**: Standardized on modern Immich search architecture, requiring Immich v3.2.0 or newer.
- **Interactive Hybrid Map Layer**: Replaced the pure satellite basemap with a high-contrast Hybrid map layer combining aerial satellite photography with crisp road networks, bridges, administrative borders, and geographic labels for improved navigation and landmark identification.
- **Replay Map Viewport-Aware Navigation**: Enhanced replay and match review maps so clicking any empty map region smoothly centers the view, photo tab switching no longer pulls the camera away if the pin is already visible on-screen, and the reset zoom button toggles smoothly between round pin framing and a full world overview.
- **Context-Aware Back Navigation**: Replay viewers, challenge results, and player profile screens now return to the exact page you arrived from (such as a player profile or the home screen) rather than redirecting to the catalog, preserving scroll position and active filters.
- **Harmonized Challenge Lifecycle & Status Filters**: Renamed the Challenges Hub filter tab from "Expired" to "Concluded" to accurately represent all completed challenges (both time-expired and creator-deactivated events). Harmonized outcome banner titles and Portuguese translations to clearly distinguish the final gameplay outcome ("Concluído") from administrative deactivation ("Desativado").
- **Unified Match Review & Replay Outcomes**: Challenge match replays and live post-game review screens now share a unified outcome pipeline, ensuring consistent winner banners, podium presentations, and concluded participant tallies across both active and archived matches.
- **Unified Screen Header Architecture**: Standardized header lockups across Match Replays, Game Results, and Player Profiles with consistent top-left back navigation, concise minute-level timestamps, and uniform multi-tier subtitle metadata for challenge and local matches.
- **Challenges Hub Sharing Scope**: In the Challenges Hub, the quick-share drawer button is now strictly shown for active challenges, preventing dead invitation links from being shared for expired events.

### Fixed

- **Expired Challenge Status Badge in Challenges Hub**: Fixed an issue where time-expired challenges were incorrectly labeled with the grey "Deactivated" badge instead of the amber "Expired" status badge.
- **Accurate Challenge Landing State Messages**: Challenge landing pages now explicitly distinguish between events that expired by deadline versus those deactivated early by the creator, displaying clear, tailored messages for each condition.
- **Replay and Summary Standings Parity**: Fixed a disparity where viewing a challenge match through replay showed inaccurate round counts (e.g. 20/20 instead of 2/20), reversed player rankings, and false winner awards when players had not completed all rounds. Replay and review screens now display identical standings, progress tallies, and outcome banners.
- **Challenge Invite Visibility on Ended Events**: Fixed an issue where the "Invite Friends" button and drawer continued to appear on Game Results review screens for challenges that had already concluded or expired.
- **Provisional Results Banner on Concluded Challenges**: Fixed an issue where the "Results are provisional" banner remained indefinitely on the Grand Reveal and Match Review screens after a challenge had concluded.
- **Free Map Panning During Match Reviews**: Fixed an issue where selecting a photo or having its marker popup open prevented panning the map away by locking the viewport to the pin. Popups now stay anchored to their pins without preventing free exploration, and clicking empty map areas keeps the selected photo active.
- **Match Header Subtitle Wrapping on Mobile**: Eliminated awkward 3-line metadata wrapping and orphaned leading bullets in mobile Game Results and Match Replay headers.
- **Accurate Player Profile Match Ranks**: Fixed the recent matches table on player profile views displaying 1st place medals for non-winning challenge entries and solo local games. Ranks now accurately reflect actual standings across challenge participants, and solo games display a neutral dash.
- **Accurate Unshuffle Match Target Metadata**: Fixed match specifications on summary and challenge cards always displaying "Pins & Timeline" for Unshuffle games even when configured for Location only or Date only. Target badges now uniformly show "Location & Date", "Location only", or "Date only" across both Pinpoint and Unshuffle modes.

### Removed

- **Redundant Home Button on Summary Screen**: Removed the redundant "Return to Home" button from the match summary actions footer, keeping the screen focused on primary game actions (Play Again, Share Results) alongside the standardized top back button and persistent navigation bar.

## [4.0.0] - 2026-10-04

### Changed

- **Rebranded to SnapGuess**: Rebranded application, package name, and repository to SnapGuess with fixed brand title, updated PWA manifest, and bilingual localization parity.

## [3.4.0] - 2026-10-04

### Added

- **Mobile app install banner and guidance**: Added an in-app bottom install banner and header action with a crisp vector download icon on mobile devices, plus interactive step-by-step guidance for adding the app to the home screen on iOS Safari.

### Changed

- **Distraction-free gameplay view**: Hidden the top navigation bar, install button, and install prompts during active rounds and reveals to maximize screen space for photos and maps while preventing accidental interruptions during timed guessing.

### Fixed

- **Fullscreen photo review isolation**: Fixed an issue where navigating photos with arrow keys in fullscreen preview could accidentally advance or reverse rounds in the background during game reviews and replays.
- **Unshuffle perfect score parity**: Fixed an issue where perfect answers in multiplayer Unshuffle matches displayed as 100 for the active player but appeared as 99 for opponents on the leaderboard and replay screens.

## [3.3.2] - 2026-10-03

### Added

- **Drag-and-drop card reordering**: Drag photo cards (or press and hold on touchscreens) to quickly arrange them chronologically in Unshuffle mode.
- **Fullscreen photo zoom and pan**: Inspect photo clues with pinch-to-zoom, double-tap zoom, mouse wheel controls, and drag-to-pan in fullscreen preview.
- **Adaptive Unshuffle layout**: Responsive multi-column and horizontal timelines on wide screens, and optimized vertical stacking for phones and foldable devices.

### Changed

- **Direct tap-to-zoom previews**: Tap or click any photo thumbnail across Pinpoint, Unshuffle, and Replays to instantly open the interactive fullscreen preview.
- **Mobile UI & standings polish**: Improved header identity badge sizing and responsive summary tables for small phone viewports down to 360px.

### Fixed

- **Round transition image flicker**: Eliminated momentary flashes of previous rounds' photos when transitioning between rounds in Unshuffle mode and replays.
- **Unshuffle touch gesture handling**: Swiping across cards scrolls smoothly without triggering accidental card dragging.
- **Pinpoint exact date scoring**: Correctly awards full points (100) and 0 days delta when matching the exact month in Pinpoint challenge matches.

## [3.3.1] - 2026-09-30

### Changed

- **Pinpoint date guessing**: Month names display in full and update when the language changes.
- **Compact city filter locations**: Narrow city dropdowns show ISO-2 country codes beside each city, while the Countries dropdown keeps full names.

### Fixed

- **Match replay scoping**: Regular users can only view replays they participated in, including when opening a direct replay link or viewing match history in player profiles.

## [3.3.0] - 2026-09-29

### Added

- **Replays catalog improvements**: better search, sorting, "My Matches" filter, and direct player-profile links.
- **Verified player identity** defaults, locking, and quick suggestions for signed-in users.
- **Personalized player directory** highlights and profile badges.

### Changed

- **Player profile links and ranking behavior** are now more consistent across results, standings, and replays.
- **Mobile and desktop UI polish** for headers, filters, and match cards to improve clarity and responsiveness.
- **Visual consistency updates** for rank badges, avatars, names, and date labels.

### Removed

- **Redundant status text and podium clutter** to keep the UI cleaner on smaller screens.

### Fixed

- **Mobile layout bugs** in reveal and replay views, including clipping and cramped controls.
- **Autocomplete, persistence, and avatar issues** that caused frustrating UI inconsistencies.
- **Settings resets and layout instability** after returning home or refreshing the page.

## [3.2.2] - 2026-09-27

### Added

- **Play Again & Return Home Actions on Results**: Added quick action buttons to the match summary screen, allowing players to instantly replay with the same settings or return to home without scrolling.
- **Mobile Swipe Navigation for Replay & Photos**: Swipe left or right on mobile devices to smoothly browse through replay photos and rounds, flip between batch photos in Unshuffle review, and navigate fullscreen photos in the photo lightbox.

### Changed

- **Compact Match Specifications Layout**: Reduced spacing between game setup and photo filter categories across challenge cards, landing pages, and match summary replays to eliminate empty space and optimize vertical screen space.
- **Direct Link Sharing**: Sharing results now directly shares the challenge summary link (in Challenge Mode) or the match replay URL (in Local Match and Replay views) with instant copy feedback, replacing the lengthy text score breakdown.
- **Compact Mobile Landing Quick Links**: Optimized the explore more links on the player landing screen on mobile devices into compact rows to reduce vertical scrolling.

### Fixed

- **Match Summary Leaderboard Scope**: Fixed an issue where the leaderboard on the match summary screen lost the match's game settings, round duration, and photo filters when reopening or refreshing the summary link.
- **Challenge Created Time Localization**: Fixed unlocalized creation timestamp label displayed on challenge creation confirmation cards, correctly presenting localized timestamps in English and Portuguese.
- **Dark Mode UI Consistency**: Resolved visual contrast and styling issues in dark mode, including fixing repeating chevrons across select dropdowns, ensuring seamless dark backgrounds on the Prepare Game modal action footer and challenge link share box, enhancing the "Link Copied" popup balloon and copy button feedback with glassmorphic dark styling and crisp status icons, and improving contrast and readability of active player name chips, unshuffle ranking chips, and photo sync completion popovers.

### Removed

- **Duplicate Replay Exit Button**: Removed the duplicate exit button from the replay screen's bottom action bar in favor of the header back button.
- **Redundant Challenge Replay Button**: Removed the standalone Replay button from challenge cards on the Challenges Hub in favor of the Results button, which already embeds the full interactive match replay deck alongside challenge standings and podium.
- **Empty Challenges Create Button**: Removed the create challenge action button from the empty state on the Challenges Hub page for a cleaner discovery view.

## [3.2.1] - 2026-09-24

### Fixed

- **Player Display Name with Cloudflare Access**: Correctly resolves and displays real player names mapped from Cloudflare Zero Trust and external identity providers (Google, Microsoft, OIDC) instead of falling back to the email username prefix.

## [3.2.0] - 2026-09-24

### Added

- **Dark Mode & Theme Switcher**: Full dark mode redesign with a quick toggle in the settings menu between Clear and Dark themes across all screens, dialogs, maps, and controls.
- **Access Control & Player Landing**: Role-tailored views (Guest, Player, Creator) with an identity badge in the header and a simplified Home landing screen for joining challenges directly.
- **Leaderboard Scope Tooltip & Dynamic Updates**: Filter breakdown tooltip on the leaderboard scope pill with real-time ranking updates when changing guess modes.

### Changed

- **Range Slider Controls**: Smoother timeline date range slider with tactile grab handles, highlighted track, and click-to-seek navigation.
- **Compact Player Stats Overview**: Streamlined 4-column overview grid for player profiles and statistics across desktop and mobile.
- **Match Review Layout**: Redesigned match summary with dedicated scoreboard cards and an encapsulated review console.
- **Icon & UI Terminology Polish**: Unified icons (`👥` for Players, `🕹️` for Local Game) and shorter, punchier labels across English and Brazilian Portuguese.

### Fixed

- **Challenge Summary Location**: Fixed photo location display in the challenge summary screen.

## [3.1.0] - 2026-09-20

### Added

- **Player Statistics, Profiles & Analytics (`/players`, `/players/:playerName`)**:
  - Comprehensive player profiles with lifetime statistics: career points, win rates, podiums, peak accuracy, best distance, perfect round tallies, average response times, and 4-tier Location and Date accuracy distributions.
  - Dedicated **Player Directory** (`/players`) with real-time telemetry badges, search and sorting (by matches, win rate, points, name), and guided onboarding empty states.
  - Interactive player name links on the Home Leaderboard routing directly to player profile analytics.
- **Match Replay Engine & Universal Review Deck (`/replays`, `/game/:matchId/replay`)**:
  - Interactive round-by-round match replay viewer featuring photo lightbox previews, dynamic Leaflet maps with true photo locations, player guess pins, distance connector lines, and cumulative scoreboards.
  - Universal 3-tab **Review Deck** (`🎬 Match Replay`, `🗺️ Journey Map`, `📸 Photo Memories`) unified across live game summaries, challenge summaries, and replay archives.
  - Dedicated **Match Replay Catalog** (`/replays`) with search, mode/type filtering, and direct replay action shortcuts from challenge cards.
  - 3D Winner Podium & Final Standings Outcome Hero integrated directly into historical match replays and challenge summaries.
  - Match Specification Panel detailing game settings, rounds, time limits, and library filter scopes in replay headers.
- **Smart Player Name Autocomplete**:
  - Intelligent autocomplete dropdown querying player history with match frequency, recency, and avatar initials.
  - Seamlessly integrated into Local Game setup, Challenge creation, and Challenge join screens with keyboard accessibility and mobile-optimized touch targets.
- **Sync Telemetry & Rate Limiting**:
  - Animated post-sync completion popup displaying detailed breakdown metrics: sync mode, photos indexed/updated, albums linked, tags, pruned assets, and execution duration.
  - Configurable sync cooldown (`SYNC_COOLDOWN_SECONDS`) with HTTP 429 throttling and a real-time countdown button indicator.
- **New REST API Endpoints**:
  - `GET /api/players/names` (autocomplete query with match frequency).
  - `GET /api/players` (player directory with sorting and pagination).
  - `GET /api/players/{player_name}/profile` (career stats and accuracy distribution analytics).
  - `GET /api/matches` (paginated match history filterable by game mode, play mode, and player).
  - `GET /api/match/{match_id}/replay` (round-by-round guess telemetry and cumulative scoreboard).

### Changed

- **UI & Navigation Modernization**:
  - Consolidated language and audio preferences into a clean header settings dropdown (`⚙️`).
  - Standardized `.hub-page-header` and `.hub-toolbar` design system across Challenges, Replays, Players, and Moderation views with unified search inputs, SVG icons, and baseline alignment.
  - Automatic viewport auto-scroll to `#game-card` during active gameplay to maximize vertical screen real estate for maps and photo media.
  - Unified challenge play mode icon to crossed swords (`⚔️`) across all UI elements, badges, and headers.
- **Mobile Summary Screen & Chip Optimization**:
  - Omitted `.match-meta-item-label` on mobile viewports (`<= 640px`) across all summary variations, Challenges Hub cards, and the setup filters accordion, displaying a clean, compact `[icon] [value]` chip layout that fits comfortably side-by-side without horizontal scrolling.
  - Constrained `.match-review-card`, `.match-review-shell`, and `.review-content` with `min-width: 0; max-width: 100%` and set `flex-shrink: 0` on chips, ensuring match cards remain perfectly proportioned within narrow mobile screens while standings tables scroll smoothly.
  - Enhanced podium step readability and dark mode contrast across summary cards.
  - Omitted flag emoji (`🏁`) from `challenge-rounds-pill finished` in standings tables, keeping the pill compact (`10/10`) and saving valuable horizontal column space on mobile screens.

## [3.0.4] - 2026-09-11

### Added

- **Immich 3.2+ Search API v2 Support & Modernization**:
  - Implemented automatic Immich server version detection via `GET /server/version` (`get_server_version()` & `supports_search_v2()`).
  - Added support for Immich 3.2+ structured Search API v2 (`filter: { ... }`) and cursor-based pagination (`cursor` / `nextCursor`).
  - Added explicit exclusion of trashed assets (`trashedAt: { eq: null }`) to mirror legacy behavior in Search API v2.
  - Retained 100% backward compatibility with pre-3.2 Immich instances using automatic fallback to legacy flat search parameters (`page`, `updatedAfter`).
  - Future-proofed the sync engine for the planned removal of flat search parameters in Immich v4.0.0.

## [3.0.3] - 2026-09-11

### Added

- **Album Shuffle Direct Pin Chip Selectors**:
  - Replaced the static `📍 -` text with direct interactive `[A] [B] [C]` pin chip selectors on each photo card.
  - Tapping a chip matches the photo to that lettered map pin with zero modal ambiguity and smart auto-swapping.
- **Album Shuffle Photo Pin Heads on Map**:
  - Map markers now display the photo's circular thumbnail directly inside the pin head when assigned, accompanied by a color-coded letter badge.
  - Retains crisp, high-contrast letter styling when unassigned, enabling immediate visual verification of photo locations on the map.

### Changed

- **Album Shuffle Help Balloons and Guidance**:
  - Updated in-game help text across English and Portuguese to reflect direct card chip selection and visual photo pin heads on the map.
  - Streamlined `docs/GAMEPLAY.md` documentation for Album Shuffle matching rules.

## [3.0.2] - 2026-09-11

### Added

- **Scoped Challenge Public Routes & Seed-Validated Media Proxy**:
  - Consolidated all public participant challenge access under `/play/*` (`/play/api/:token/*` and `/play/media/:token/:asset_id`).
  - Added strict server-side capability and challenge seed validation (`is_asset_in_challenge`): participants can only fetch image thumbnails belonging to their active, unexpired challenge match, preventing arbitrary Immich library scanning.
  - Added in-game photo inconsistency reporting via `POST /play/api/{token}/flag` allowing challenge players to report misplaced GPS tags or dates without exposing administrative moderation APIs.
- **Dynamic Preflight Count Updates by Guess Mode**:
  - Preflight counter in setup and home screen now dynamically updates based on active guess mode toggles (Location/GPS, Date, or both).
  - Toggling Location or Date immediately recalculates eligible counts and warnings using `both_count`, `gps_count`, and `date_count`, and triggers a debounced server check.
  - Added `both_count` field to `PreflightResponse` and `MetadataStore.get_asset_counts` to provide full breakdown data.
  - Bound event listeners to `#game-settings-container` and `#round-count` to react to mode toggles and round requirement changes instantly.
- **Streamlined Zero Trust & Reverse Proxy Path Security**:
  - Simplified Cloudflare Access, Caddy, Nginx, and Traefik deployment by exposing only `/play/*` and `/static/*` for public challenge participants.
  - Keeps root (`/`), Challenges Hub (`/challenges`), Moderation Dashboard (`/reported`), and administrative endpoints (`/api/*`) strictly protected behind host authentication with zero complex reverse-proxy path regexes or priority conflicts.

### Changed

- **Clean Architectural Separation of Host and Player APIs**:
  - Split challenge router into host management (`/api/challenge/*`) and player participant routes (`/play/api/*`, `/play/media/*`).
  - Updated all challenge game engine views (Game, Intermission, Reveal, and Summary) and in-game report modals to consume the scoped `/play/*` APIs.
  - Enhanced router navigation state to support silent history updates, preventing redundant re-render loops on URL parameter updates.

### Fixed

- **Service Worker and HTTP Dynamic Response Caching**:
  - Updated Service Worker (`sw.js`) to bypass caching for `/play/api/` and `/play/media/`, ensuring real-time multi-tab and multiplayer standings are never served from stale caches.
  - Hardened dynamic API endpoints with HTTP `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` headers while preserving immutable client caching for static and media proxy assets.

## [3.0.1] - 2026-09-09

### Fixed

- **Leaderboard data selection**: Fixed leaderboard query to correctly filter when no media filters are applied.

## [3.0.0] - 2026-09-07

### Added

- **Asynchronous Multiplayer Challenge Mode**:
  - Seed-based deterministic challenges with shareable capability URLs, vector QR codes, and native 1-click sharing.
  - Dedicated **Challenges Hub** (`/challenges`) with discovery metrics, search, status filters (Active/Expired), and interactive standings drawer.
  - Real-time multiplayer feedback: live activity toasts, animated opponent pin drops on reveal maps, pulsing header badges, and dynamic podium transitions.
  - Standalone summary route (`/play/:token/summary`) with mode-tailored Grand Reveal scatter maps and photo journey galleries.
  - 16-color clash-free participant avatar palette maintained across maps, round headers, and leaderboards.
- **Reported Asset Moderation Dashboard (`/reported`)**:
  - Dedicated admin dashboard to search, filter, and inspect flagged assets with direct Immich Web deep links.
  - Resolution workflow to unflag assets and return them to the active photo pool in real time.
- **Setup Controls & Interactive Help Modals**:
  - Tactile segmented button controls for rounds and duration with responsive mobile bottom-sheet styling.
  - Dedicated contextual help modals for Pinpoint and Album Shuffle accessible directly from the lobby and in-game headers.
  - Accessible modal focus trapping and native Web Share API integration with SVG icons and animated copy feedback.
- **Universal Dynamic Localization & Automated Verification**:
  - Seamless runtime language switching across all screens without page reloads.
  - Automated DOM scanner and E2E test suites verifying 100% translation key parity between English and Brazilian Portuguese.
- **Performance & Infrastructure Hardening**:
  - Authenticated media proxy with HTTP `ETag` / `304 Not Modified` caching for smooth photo transitions.
  - Periodic SQLite checkpointing, thread-pool offloading via `asyncio.to_thread()`, and container least-privilege non-root execution (`1000:1000`).
  - Optimized CI/CD and release pipeline with automated changelog extraction in GitHub Releases, QEMU multi-arch Docker builds (`linux/amd64`, `linux/arm64`), and dedicated [Release Guidelines](docs/RELEASES.md).

### Changed

- **Terminology Standardization & UI Copy Simplification**:
  - Unified consistent, accessible naming in English and Portuguese across navigation, game setup, play styles, and awards (e.g., *"Solo"*, *"Pass & Play"*, *"Submit Guess"*, *"Photo Memories"*).
  - Streamlined mode descriptions, scoring documentation, and help modal instructions.
- **Symmetric Architecture & Decoupled Game Engines**:
  - Symmetrically decoupled data models (`PinpointReveal`, `UnshuffleAnswerItem`), unified backend round state (`RoundData`), and cleanly scoped frontend state.
  - Standardized round review layout, responsive map token heights, and full-resolution lightbox support across all game modes.
- **Dynamic Asset Stamping & Caching**:
  - Automatic version stamping in HTML templates and Service Worker (`sw.js`) eliminating stale cache issues on upgrades.

### Fixed

- **Opponent Round Reveal Telemetry & Pin Placement**: Fixed game-mode detection bug in round reveals, restoring opponent distance errors, dates, timeout badges, and live participant counts.
- **Navigation & Submission Safety**: Added in-progress match notices for new tabs and optimistic locking to prevent duplicate round submissions.
- **Cross-Platform & Environment Compatibility**: Resolved UTF-8 console emoji logging crashes on Windows and ensured backend translation files are bundled in Docker builds.

## [2.5.0] - 2026-08-29

### Added

- **Photo Inconsistency Reporting & Source Links**:
  - Added "Report Issue" button (🚩) and accessible modal dialog to the round reveal screen across both Pinpoint and Album Shuffle game modes.
  - Three-field issue reporting: Inaccurate GPS / Map Location (`flag_coordinates`), Wrong Date / EXIF Timestamp (`flag_date`), and Free-text notes (`other`).
  - Active reporting player name attribution (`reported_by`) captured and persisted with each flagged asset.
  - Direct Immich Web link (`https://<immich-url>/photos/{asset_id}`) within the modal for quick source metadata editing in Immich.
  - SQLite persistent storage (`flagged_assets` table) tracking reported asset IDs, issue types, notes, reporting player, and timestamps with automatic migration.
  - REST API endpoints for flagging (`POST /api/assets/flag`), listing (`GET /api/assets/flagged`), and unflagging (`DELETE /api/assets/flagged/{asset_id}`).
  - Backend configuration safeguard `EXCLUDE_FLAGGED_ASSETS=true` (default: `True`) to automatically filter reported photos out of candidate pools without needing intrusive UI toggles.
  - Playwright E2E test suite for the reporting workflow (`tests/e2e/test_report_issue.py`).
  - Full bilingual localization (English & Brazilian Portuguese) for report modal and notification strings.

## [2.4.1] - 2026-08-28

### Added

- **Playwright End-to-End (E2E) Test Suite**:
  - Live FastAPI test harness with simulated Immich client (`tests/e2e/conftest.py`).
  - Pinpoint map pin placement, distance lines, and round reveal tests (`test_pinpoint_gameplay.py`).
  - Dual-handle timeline range slider and single-year/month date guessing tests (`test_date_selection.py`).
  - Album Shuffle photo card reordering and multi-pin (A, B, C) placement tests (`test_unshuffle_gameplay.py`).
  - Client routing, deep links, reload recovery, and guard tests (`test_routing_and_recovery.py`).
  - Score rollup animations, podium rendering, and polaroid gallery tests (`test_summary_and_effects.py`).
  - Playwright Chromium installation in CI workflow and pre-push git hook.
- **Match Place Metadata Persistence**: Stored `actual_city` and `actual_country` in SQLite `match_round_guesses` for replayable match summaries.

### Changed

- **Unified Place Formatting**: Standardized polaroid cards and journey maps to display `City, Country` across all game modes.

### Fixed

- **Audio & Haptic Autoplay Restrictions**: Added user-activation guards to prevent browser console warnings on page reload.
- **Victory Fanfare Trigger**: Scoped fanfare audio to active match completions, suppressing it during page refreshes and direct permalinks.
- **Frontend Controller Cleanup**: Added missing module imports, fixed button click bindings with safe null checks, and resolved DOM ID collision in Album Shuffle reveal tables.
- **UI Config Endpoint**: Aligned frontend configuration request with `/api/ui-config`.
- **Game Mode Initialization**: Fixed mode selector settings initialization on startup.

## [2.4.0] - 2026-08-28

### Added

- **Client-Side History API Router & Deep Links**:
  - Direct URL routing for `/` (Lobby), `/game/{match_id}` (Active Match), and `/game/{match_id}/summary` (Replay & Podium).
  - In-game session recovery from `sessionStorage` on page reload.
  - Dedicated "Match Ended" screen with quick links when visiting expired matches.
  - In-game navigation guards to prevent accidental tab closing or abandonment.
  - Shareable match summary permalink URLs.
- **Permanent SQLite Match History**: Replaced in-memory match summaries with persistent SQLite storage (`LeaderboardStore`) and authorized photo proxy access (`/api/media/{asset_id}`) for replays.
- **FastAPI SPA Catch-All Route**: Added `/{full_path:path}` fallback handler and updated PWA service worker caching for seamless offline routing.

### Changed

- **Modular Screen Controllers**: Refactored monolithic `app.js` into focused controllers under `static/js/modules/screens/` (`setup.js`, `game.js`, `reveal.js`, `summary.js`, `common.js`).
- **Datetime Safety**: Added safe ISO datetime parsers in SQLite storage and a typed `.seconds` helper on `RoundLength`.

### Fixed

- **Pass-and-Play Timer**: Fixed round timer ticking during the "Pass Device" screen and prior to clicking "I'm ready".

## [2.3.0] - 2026-08-28

### Added

- **Album Shuffle Partial Credit Scoring**:
  - Nearby map pin credit based on distance error instead of all-or-nothing points.
  - Close timeline date credit for near-accurate chronological order.
  - Batch-adaptive scoring scaling adjusted to the photo pool's geographic and temporal span.
  - Detailed per-photo distance errors and day differences in round telemetry.
- **Structured Console & Container Logging**: Color-coded, timestamped console logs with match tracing, request ID tracking, and automatic Immich API credential masking.
- **Smooth 60 FPS Countdown Timer**: Fluid progress bar driven by `requestAnimationFrame`, dynamic color transitions (Teal → Amber → Crimson), rising-pitch audio ticks (440 Hz → 880 Hz), and smart `M:SS` / `Xs` time formatting.

### Changed

- **Location Sensitivity Tuning**: Adjusted base decay scaling (5 km base for neighborhoods, up to 200 km for worldwide albums).
- **Audio Synchronization**: Centralized score rollup sound effects across multiplayer reveals.
- **Scoring Engine**: Unified adaptive decay functions across all game modes.

### Removed

- **Redundant Config**: Removed unused `LOCATION_MAX_SPAN_KM` environment setting.

### Fixed

- **Double-Click Protection**: Prevented duplicate match creation when rapidly clicking "Start Match".
- **Score Rollup Animation**: Fixed score counter speed inconsistencies on reveal and summary screens.

## [2.2.0] - 2026-08-25

### Added

- **Progressive Web App (PWA)**: Installable standalone web app with service worker offline shell caching, in-app install prompt, and high-DPI icon suite.
- **Mobile Ergonomics & Haptics**: Added iOS notch/safe-area insets (`env(safe-area-inset-*)`) and Web Vibration API haptics for timer countdowns, buzzer, pin drops, and victory fanfares.
- **Wall-Clock Timer Synchronization**: Real-time timer calculation against target timestamps (`Date.now()`) with Page Visibility API sync to prevent timer freezing in background tabs.
- **Navigation Protection**: Added confirmation dialogs for browser back navigation and tab closure during active rounds.
- **Internationalization (i18n)**: Migrated to BCP-47 language tags (`en-US`, `pt-BR`), externalized JSON catalogs, RFC 9110 `Accept-Language` negotiation, and Unicode CLDR plural/date formatting.

## [2.1.0] - 2026-08-24

### Added

- **Dynamic Scoring Decay**: Replaced static global decay constants with per-match calculations tailored to the geographic and temporal distribution of candidate photos.

### Changed

- **Smart Map Initial Zoom**: Increased maximum initial zoom to level 13 for tighter framing on neighborhood and city-scale albums.

### Removed

- **Static Decay Configuration**: Removed `LOCATION_SCORE_DECAY_KM` and `DATE_SCORE_DECAY_DAYS` environment variables in favor of dynamic per-match calculations.

## [2.0.0] - 2026-08-17

### Added

- **Local Metadata Storage & Sync Engine**: SQLite-backed caching layer (`data/metadata.db`) for assets, albums, recognized faces, and geographic places with automatic background sync.
- **Library & Photo Filters Accordion**: Collapsible filter section for Libraries, Multi-Album selection, Date Range, Geography (Countries & Cities), and People (ANY/ALL matching).
- **Dynamic Date Range Slider**: Dual-handle interactive range slider with year-month resolution and live timeline boundary discovery.
- **Photo Play Tracking & Diversity**: Tracks photo play frequencies in SQLite (`times_played`) to prioritize unplayed photos, paired with spatial (≥100m) and temporal (≥60s) downsampling.
- **Relational Match & Multiplayer Schema**: 4-table SQLite schema (`matches`, `match_entries`, `match_round_guesses`, `challenges`) under `data/leaderboard.db` tracking detailed round telemetry and fair tiebreaking.
- **Live Preflight Counter**: Real-time counter showing eligible photo counts and filter breakdown tooltips before starting a match.
- **Interactive Player Input**: Chip-based player input with avatar badges, player colors, duplicate detection, and keyboard navigation.
- **Tag Filtering**: Global `TAG_WHITELIST` and `TAG_BLACKLIST` support for server-level asset eligibility filtering.

### Changed

- **Setup Screen Hierarchy**: Streamlined match setup flow into logical sections: Players, Dataset Filters, Game Mode, and Guessing Settings.
- **Leaderboard API**: Enhanced `/api/leaderboard` with filtering by `player_name`, `is_custom_filtered`, and `limit`.

### Removed

- **Legacy CSV Storage**: Removed CSV leaderboard persistence in favor of SQLite databases (`metadata.db` and `leaderboard.db`).
- **Redundant Settings**: Removed static photo diversity and map zoom environment variables in favor of automatic heuristics.

## [1.2.1] - 2026-08-15

### Fixed

- **Shared Album Filtering**: Ensured user-owned shared albums remain visible when `INCLUDE_SHARED_ALBUMS=false`.

## [1.2.0] - 2026-08-13

### Added

- **Smart Map Zoom (Pinpoint Mode)**: Geographic auto-framing based on match photo distribution, eliminating repetitive manual map zooming.
- **Regional Focus Button**: Added a Leaflet toolbar control to snap back to the album's regional view at any time.
- **Map Canvas Zoom Bounds Guard**: Computed dynamic `minZoom` to prevent tiles from rendering smaller than the container canvas.

### Changed

- **Setup Layout**: Reorganized match setup into Player Settings, Library Settings, and Game Settings.

## [1.1.0] - 2026-08-13

### Added

- **Searchable Multi-Select Album Selector**: Added real-time text searching of albums, multi-album selection, and batch Select All / Deselect All actions.

## [1.0.2] - 2026-08-12

### Fixed

- **Round Reset**: Fixed game state reset when restarting rounds.

### Added

- **Map Reset Control**: Added button to reset map view to default zoom.

### Changed

- **Map Creation**: Unified Leaflet map initialization and Immich query controls.

## [1.0.1] - 2026-08-12

### Fixed

- **Design Polish**: Standardized UI element styling and layout consistency.

## [1.0.0] - 2026-08-08

### Added

- **Album Shuffle Game Mode**: Hybrid batch mode where players match 3 photos to map pins (`A`, `B`, `C`) and sort them chronologically (`1st`, `2nd`, `3rd`).
- **On-the-Fly Language Toggle**: Dynamic switching between English (EN) and Brazilian Portuguese (PT) without resetting active game state.
- **Extended Round Lengths**: Added `2m` and `5m` timers for batch photo sessions.
- **Mobile Responsive Layout**: Optimized UI dimensions and touch controls for narrow screens.
- **Audio Playground**: Web Audio API oscilloscope and sound effect testing suite (`/audio-test`).
- **Frontend Regression Tests**: Automated structural tests for HTML markup, IDs, and script exports.

### Changed

- **Modular Code Architecture**: Modularized frontend scripts (`modules/modes/`) and stylesheets (`static/css/`).

### Fixed

- **Date Error Rounding**: Fixed precision rounding for date error deltas.
- **Multiplayer Tie-Breaking**: Improved leaderboard tiebreaker resolution.

## [0.3.0] - 2026-08-08

### Added

- **UI Animations**: Visual transitions for modals, round reveals, and buttons.
- **i18n Expansion**: Expanded translations across all screens.

### Changed

- **Podium Awards**: Scoped podium avatars exclusively to multiplayer matches.
- **Map Rendering**: Improved Leaflet auto-centering and viewport responsiveness.

## [0.2.0] - 2026-08-08

### Added

- **Audio Playground**: Audition and test Web Audio sound effects.

## [0.1.2] - 2026-08-08

### Added

- **Developer Tooling**: Added VS Code task definitions, git pre-push hooks, and GitHub Actions release workflows.
- **URL Normalization**: Automatically appends `/api` to server endpoints if omitted.

### Changed

- **Album Ordering**: Sorted album dropdown items alphabetically.

### Fixed

- **Audio Preference Persistence**: Fixed localStorage audio setting persistence.

## [0.1.0] - 2026-08-08

### Added

- Initial release of **Immich Quiz**.
- Single photo **Pinpoint** mode (Location and Date guessing).
- Immich API integration with asset preflight validation.
- Pass-and-play local multiplayer with performance awards (**Sniper**, **Time Traveler**, **Speed Demon**).
- Web Audio sound engine.
