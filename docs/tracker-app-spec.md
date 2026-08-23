# Self-Hosted TV/Movie Tracker PWA — Functional Spec v2

Multi-user (household), Docker-hosted replacement for a Trakt-style tracker, exposed outside the LAN via an existing Cloudflare Tunnel already running on your Unraid server. Built from screenshots of the reference app. This doc is the source of truth to hand to Claude Code for scaffolding and iterating on the build.

---

## 1. Goal & Scope

Track watched/watching status for TV shows and movies per household member, surface upcoming episode/movie releases, and do it all self-hosted via Docker with no ongoing dependency on a third-party service that could shut down. Deliberately smaller in scope than the reference app — no social features, no ratings/reviews, no streaming-availability lookups. Just: what am I watching, what's next, what's coming — per person in the household.

**Multi-user, real auth required.** Because this is reachable from the public internet through your tunnel (not just LAN-trusted), it needs actual login, not a network-level assumption of trust. Accounts are created manually by you (no self-registration UI) — see Section 4. Each user's watch data is fully private; no household member can see another's watch list or status.

---

## 2. Tech Stack

- **Single Laravel project** using the official Laravel React starter kit (Laravel 13, PHP 8.5, Inertia.js v3, React 19, TypeScript, Tailwind v4, shadcn/ui). No separate backend/frontend split, no separate REST API — Laravel controllers return Inertia responses (page component + props), React renders them client-side after the first load. Frontend code lives in `resources/js/`.
- **Auth:** standard Laravel session-based auth (the `web` guard), which is what the starter kit ships with — no Sanctum needed, since Inertia pages and the backend share the same origin by definition. Configure a long session lifetime (see Section 8 — PWA installs shouldn't need to log in repeatedly). The starter kit includes a self-registration flow by default; **that gets removed/disabled** since accounts are created manually (Section 4/10).
- **DB:** PostgreSQL, its own container with a named volume.
- **Queue/Scheduler:** Laravel's built-in scheduler (cron-driven) for the nightly TMDB sync job; `database` queue driver (no Redis needed at this scale).
- **PWA layer:** `vite-plugin-pwa` (Workbox) added on top of the starter kit's existing Vite config, handling manifest.json + service worker + install prompts. Offline caching targets Inertia page-visit responses and poster/still images, not a separate REST API.
- **Exposure:** No tunnel container in this stack — you already run `cloudflared` on your Unraid server. This compose file just needs to expose the `web` service on the Docker network (or a fixed host port) so your existing tunnel config can point a route at it. Since your tunnel already terminates HTTPS, the app gets real HTTPS end-to-end, which service workers require.
- **Containers (docker-compose):**
    - `app` — PHP-FPM running the Laravel/Inertia app
    - `web` — nginx, serves the app (Laravel routes + built Vite assets), reachable by your existing `cloudflared` container
    - `db` — Postgres, named volume for data
    - `scheduler` — same app image, runs `php artisan schedule:work`
    - `queue` — same app image, runs `php artisan queue:work`

---

## 3. Data Sources & External ID Strategy

- **TMDB** for all metadata (show/movie search, episode lists, air dates, runtimes, images) in v1.
- **Trakt** deferred until API approval comes through, added as a second provider later — not blocking anything now because of the mapping table below.
- **`media_external_ids` table:** `(id, media_type[show|movie], media_id, provider[tmdb|trakt|...], external_id)`. Your own DB is the source of truth; providers are just lookup keys attached to it.

---

## 4. Data Model

Show/Season/Episode/Movie are **shared metadata** — one row per title regardless of who's tracking it, so the household never fetches or stores the same TMDB data twice. Watched status and list membership are **per-user**, split into their own tracking tables.

> This section reflects the **current schema as migrated** (see `database/migrations/`). Columns added after the original v2 spec are marked _(added)_.

**User**

- `id`, `name`, `email`, `password` (hashed), `timezone` _(added — nullable IANA tz, browser-detected; drives the calendar-day cutoff for Upcoming/Watch List, falls back to app UTC)_
- Fortify auth columns: `email_verified_at`, `two_factor_secret`, `two_factor_recovery_codes`, `two_factor_confirmed_at`, `remember_token`
- Passkeys live in their own `passkeys` table.

**Show** (shared)

- `id`, `title`, `poster_image_url`, `overview`, `ended` _(added — bool; TMDB reports the show concluded. Drives auto-finishing a user's tracking once they've watched everything; refreshed nightly since concluded shows can be revived)_
- has many `media_external_ids`, `seasons`, `episodes`

**Season** (shared)

- `id`, `show_id`, `season_number`, `episode_count` (cached from TMDB)
- Unique on `(show_id, season_number)`

**Episode** (shared)

- `id`, `show_id`, `season_number`, `episode_number`, `title`, `still_image_url`, `overview`, `air_date`, `runtime_minutes`
- Unique on `(show_id, season_number, episode_number)`; `air_date` indexed for the Upcoming query

**Movie** (shared)

- `id`, `title`, `poster_image_url`, `overview`, `release_date`, `runtime_minutes`, `tmdb_collection_id` _(added — nullable; the TMDB collection/"franchise" the movie belongs to, e.g. the Star Wars Collection. The collection's member list is fetched read-through from TMDB when a movie detail opens)_
- has many `media_external_ids`; `release_date` indexed for the Upcoming query

**MediaExternalId** (shared lookup)

- `id`, `media_type` (`show | movie`), `media_id`, `provider` (`tmdb | trakt | ...`), `external_id`
- Polymorphic via `(media_type, media_id)` — no DB-level FK. Unique on `(provider, media_type, external_id)`.

**UserShowTracking** (per-user) — table `user_show_tracking`

- `id`, `user_id`, `show_id`, `status`: enum `watching | watch_later | finished | stopped` (see `App\Enums\ShowStatus`)
- Unique on `(user_id, show_id)`. Status transitions are largely **automatic** — see §9.

**UserEpisodeWatch** (per-user) — table `user_episode_watches`

- `id`, `user_id`, `episode_id`, `watched` (bool), `watch_count` _(added — unsigned int; rewatch-aware)_, `watched_date` (nullable, auto-set on toggle, editable)
- Unique on `(user_id, episode_id)`. `watched` is a derived convenience column kept in sync as `watch_count > 0`.

**UserMovieTracking** (per-user) — table `user_movie_tracking`

- `id`, `user_id`, `movie_id`, `watched` (bool), `watch_count` _(added)_, `watched_date` (nullable, auto-set on toggle, editable)
- Unique on `(user_id, movie_id)`. Same `watched = watch_count > 0` derivation as episodes.

---

## 5. Navigation & Screens

Bottom nav (mobile): **Shows | Movies | Search | Profile**. All watched-status and list-membership views are scoped to the logged-in user; the underlying show/episode/movie metadata is shared across the household.

### Shows tab

- **Watch List** sub-tab, two view modes toggled by an icon:
    - _List view_: sections — **Watch Next** (shows with an unwatched episode ready, for this user), **Watched History** (this user's recent watched log), **Watch Later** (shows this user is behind on). Each row: poster thumb, show name (tappable → detail), `S##|E##`, episode title, badge (`NEW`/`PREMIERE` if applicable), watched-toggle circle.
    - _Grid view_: poster grid grouped by this user's `status` on `UserShowTracking` — Watching / Watch Later / Finished / Stopped — with a thin colored bar under each poster.
- **Upcoming** sub-tab: episodes from shows this user tracks with future `air_date`, grouped by date (or "X days" for far-future), watched-toggle per row.

### Movies tab

- **Watch List** sub-tab: "Watch Next" grid of this user's untracked-as-watched movies; "Browse All Movies" → full grid grouped **Watched / Not Watched** (per user).
- **Upcoming** sub-tab: movies this user tracks with future `release_date`, grouped (e.g. "Later"), title + countdown ("X days").

### Show Detail

- Header: backdrop image, title, season count.
- Tabs: **About** (overview text) / **Episodes**
- Episodes tab: "Continue tracking" quick-access to this user's next unwatched episode; **All Episodes** grouped by season (collapsible), season header shows `watched/total` count for this user + a "mark whole season watched" action; expanded season lists episodes with thumbnail, `S##|E##`, title, watched-toggle.
- Tapping an episode opens the **Episode Quick View**: still image, `S##|E##`, title, overview, air date, watched-toggle, watched date (auto-filled on toggle, editable).

### Movie Detail

- Header: poster, title, release date, watched-toggle (this user).
- **About** tab: overview text only.

### Search

- Search bar, results list (poster thumb, title, type icon), add/track action (adds to the logged-in user's tracking — creates the shared Show/Movie row first if the household hasn't seen this title before). No Users/Groups tabs — no social layer.

### Profile

- Login-gated. Stats for the logged-in user: total watch time (sum of `runtime_minutes` across this user's watched episodes + movies), episodes watched count.

---

## 6. Background Jobs

- Nightly scheduled job: for each _shared_ tracked show, refresh season/episode list from TMDB (new episodes, updated/confirmed air dates, runtimes).
- Nightly scheduled job: refresh release dates and runtimes for tracked movies that don't have confirmed values yet.
- Upcoming feed is a query, not a stored table: episodes/movies where `air_date`/`release_date >= today` **and** the current user tracks the parent show/movie, sorted ascending.

---

## 7. Yamtrack Import

The authenticated settings page at `/settings/import` accepts the real Yamtrack CSV format:

`media_id, source, media_type, title, image, season_number, episode_number, score, status, notes, start_date, end_date, progress, created_at, progressed_at`

Initial support is deliberately TMDB-only and accepts `media_type=tv|season|episode|movie`. A TV, season, or episode `media_id` is the parent TMDB show ID; seasons add `season_number`, and episodes add `episode_number`. Movies use their TMDB movie ID. Stable matching always goes through `media_external_ids`, never a title or image. Each unique show/movie is resolved once per run through `MediaLibraryService`; existing metadata avoids an upstream request, while a new show fetch synchronizes its seasons and episodes before episode coordinates are matched.

The importer offers exactly two strategies:

- **Add missing history** is additive. It creates missing per-user tracking, imports episode rows and Completed movies as a minimum known watch count of one, preserves higher rewatch counts and useful newer dates, and never removes or resets app-only tracking or watches. Existing show statuses are not downgraded.
- **Replace my Tracker history** treats the file as the importing user's authoritative snapshot. Shows/movies absent from the file are removed from that user's tracking, watched episodes absent from the episode row set are reset to zero, non-Completed movies are tracked but unwatched, and imported watches are exactly one. It can reduce rewatch counts. The operation never deletes shared metadata or touches another user. Parsing must succeed before the per-user replacement transaction starts; individual TMDB titles that cannot be resolved are skipped, named in the error summary, and produce `completed_with_errors` instead of aborting the remaining import.

Yamtrack statuses map conservatively: In progress → Watching, Planning → Watch Later, and Paused/Dropped → Stopped. A TV row is primary when season statuses disagree; without a TV row, the first useful season status supplies context. Completed never forces Finished. Episode watches are applied first, then `TrackingStatusService` may finish only a concluded show whose regular episodes are all watched; specials/season 0 remain excluded from completion.

Episode rows and Completed movie rows represent one known watch. `end_date` is the preferred imported watch timestamp with `progressed_at` as fallback; timezone-bearing timestamps are normalized to UTC for the existing timestamp columns. A missing or invalid optional timestamp remains null rather than inventing a watch time.

Uploads are private, capped at 20 MB, header-validated before dispatch, and processed by the database queue. `YamtrackCsvReader` streams rows and chunked writes support production exports in the thousands (the reference export contained 7,297 rows). Progress, bounded row errors, safe failures, counters, and file hashes live in `yamtrack_imports`; raw CSV data does not. Temporary files are removed on success or terminal failure. Both strategies are idempotent, and the database prevents more than one pending/processing import per user.

---

## 8. PWA & Responsive Requirements

- Manifest + service worker via `vite-plugin-pwa`. Installable, works offline for cached data.
- **Persistent login:** log in once, stay logged in — no repeated login on each PWA launch. Configure Laravel's session cookie (`config/session.php`) with a long/effectively non-expiring lifetime, rather than the framework's short default, so the standalone PWA session survives across launches the same way an always-open browser tab would. Session ends only on explicit logout, not on a timer.
- **Mobile layout** (matches your screenshots): bottom tab bar, single-column stacked cards.
- **Desktop/large-screen layout**: improvise a distinct layout (e.g. sidebar nav, multi-column grids) and iterate on it as we go rather than locking it down up front.
- Offline: cache the JS/CSS/font shell and poster/still images — this works the same as any Vite app regardless of Inertia. Full offline _browsing_ of previously-viewed lists, and queuing watched-toggle _writes_ made offline, are both harder with Inertia than they'd be with a decoupled REST API — every Inertia page visit is a request to Laravel by design, so it's not naturally offline-first the way a plain SPA+API is. Keep both as Phase 2 stretch goals; don't block v1 on them. If they turn out to matter later, the pragmatic fix is exposing a few plain JSON endpoints for just those specific interactions rather than reworking the whole app off Inertia.

---

## 9. Interaction Behaviors

- Tap watched-toggle circle → change watched state for the logged-in user (white/unwatched ↔ green/watched). Watched state is a **count**, not a bare boolean (`watch_count`), so a tap resolves to one of three intents (`App\Enums\WatchAction`): **Increment** (0→1 first watch, or a rewatch bump), **SetOnce** (collapse a multi-watch count back to exactly one), **Reset** (count→0, not watched). `watched_date` reflects the most recent watch.
- Tap show/movie name pill → navigate to detail page.
- Tap season header's checkmark → mark/unmark entire season watched for this user.
- "Catch me up" / watch-through → mark an episode and every earlier one watched in one action.
- Grid/List icon → switch Watch List display mode.
- **Left-swipe on a Watch List show row** reveals a menu: move to Watch Later / Stop Watching (status change), or Remove (drops the tracking row but **preserves** episode watches) vs. Untrack (also resets all episode watches). Swipe-to-toggle-watched on episode rows remains a candidate refinement.

### Automatic show-status transitions (`App\Services\Library\TrackingStatusService`)

The household never has to manage a status dropdown by hand:

- Marking an episode watched on a **Watch Later** or **Stopped** show moves it to **Watching** (engagement implies active watching).
- Once a user has watched every regular episode (specials / season 0 excluded) of a show TMDB reports as concluded (`shows.ended`), their tracking flips to **Finished** — either at toggle time or during the nightly refresh (covers the "finale watched before TMDB marked it Ended" case).
- Finished is only ever _derived_, never forced: a revived show (new episodes, `ended` flips back to false) simply stops qualifying, and the nightly sync keeps `ended` fresh for exactly that reason.

### Timezone-correct calendar days

`air_date` / `release_date` are stored as timezone-less dates. "Today" for a user's Upcoming feed and Watch List is `User::localToday()` — UTC midnight of the user's local date in their detected `timezone` — so an evening in the US (already past midnight UTC) doesn't make tomorrow's episodes read as "Today". The browser silently PATCHes the detected timezone to `settings/timezone`.

### On-demand history/backlog paging

Watched History (Shows Watch List) and the aired-but-unwatched backlog (Shows Upcoming) are **not** in their page's initial payload — they are cursor-paginated JSON fetched as the user scrolls up, keeping first paint light.

---

## 10. Implementation Checklist

Status of the original build order plus features layered on since. Checked = shipped and covered by tests.

### Core build

- [x] Scaffold the Laravel React starter kit (Inertia) + docker-compose stack (`app`, `web`, `db`/Postgres, `scheduler`, `queue`) that boots and health-checks
- [x] Migrations: users, shows, seasons, episodes, movies, media_external_ids, user_show_tracking, user_episode_watches, user_movie_tracking (+ later: `shows.ended`, `movies.tmdb_collection_id`, `watch_count`, `users.timezone`)
- [x] Auth: self-registration stripped, long-lived session, `app:make-user` artisan command for creating household accounts
- [x] TMDB provider service behind a clean interface (search, show/season/episode incl. runtime, movie incl. runtime, collections)
- [x] Show/Movie tracking scoped to the logged-in user (add to list, set status) via Inertia form requests/controllers
- [x] Episode watched-toggle + season bulk-toggle, scoped per user (+ "catch me up" watch-through)
- [x] Scheduler job: nightly TMDB refresh (`tmdb:refresh`, daily 03:00) → feeds the Upcoming query
- [x] `vite-plugin-pwa` added; nav shells for Shows / Movies / Search / Profile as Inertia pages
- [x] Watch List screens (list + grid view toggle; Watch Next / Watched History / Watch Later)
- [x] Upcoming screens (Shows + Movies), incl. aired-but-unwatched backlog
- [x] Show/Movie detail pages + Episode Quick View
- [x] Expose `web` on a fixed host port for the existing `cloudflared` route
- [x] Responsive/desktop layout pass (iterated)

### Beyond the original spec (shipped)

- [x] Rewatch-aware watched state (`watch_count`, `WatchAction` increment/set-once/reset)
- [x] Automatic show-status transitions (`TrackingStatusService`) + `shows.ended` auto-finish
- [x] Per-user timezone detection and calendar-day correctness (`User::localToday()`)
- [x] Movie TMDB collection (franchise) grouping
- [x] Left-swipe Watch List actions (status move, remove-preserving-watches vs. untrack)
- [x] 2FA (TOTP) + passkeys via Fortify

### Not yet built

- [x] **Profile screen** — private, rewatch-aware TV/movie time and watch-count stats; recent media shelves; lazy full-screen show/movie libraries grouped by status with aired-episode progress; existing detail modals and account menu integrated.
- [x] **Consolidate settings into the app shell** — Account, Security (password, TOTP/recovery codes, passkeys), and Appearance now use the tracker shell at the stable `settings/profile`, `settings/security`, and `settings/appearance` URLs; the Profile kebab menu launches each category, and the legacy starter-kit dashboard/layout is gone.
- [x] **Yamtrack CSV importer** — per-user queued import with additive/replacement strategies, real-export parsing, TMDB external-ID matching, progress/error history, and idempotent watch semantics (§7).
- [ ] **Plex integration** — sync watched state from a Plex server (scrobble / library) as an additional per-user source; evaluate other providers (Jellyfin, Trakt, Emby) behind the same provider seam as TMDB.
- [ ] Offline browsing of previously-viewed lists + queued offline watched-toggle writes (Phase 2 stretch, §8)
