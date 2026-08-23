# Tracker — Self-Hosted TV & Movie Tracker PWA

A multi-user, self-hosted replacement for a Trakt/TV-Time-style tracker. Track
what you're watching, what's next, and what's coming — per household member —
without depending on a third-party service that could shut down or paywall your
history. Reachable from anywhere through your own Cloudflare Tunnel; installable
as a PWA on your phone.

See [`docs/tracker-app-spec.md`](docs/tracker-app-spec.md) for the full
functional spec, data model, and the implementation checklist (what's done vs.
what's next).

See [`docs/testing.md`](docs/testing.md) for the Pest, frontend unit, and
Playwright test strategy and exact local commands.

## Highlights

- **Per-user, private watch data.** Show/season/episode/movie metadata is shared
  (fetched from TMDB once for the whole household); watched status and list
  membership are per-user and never visible to other members.
- **Shows:** Watch List (list + grid views), Watch Next / Watched History /
  Watch Later sections, an Upcoming feed with an aired-but-unwatched backlog,
  season/episode detail with bulk "mark season watched" and "catch me up".
- **Movies:** Watch List grid grouped Watched / Not Watched, Upcoming with
  release countdowns, TMDB collection (franchise) grouping.
- **Rewatch-aware:** watched state is a _count_, not just a boolean — rewatches
  bump the count and keep the most-recent watch date.
- **Yamtrack import:** each user can add missing history or authoritatively
  replace their own library from a real Yamtrack CSV export in the background.
- **Automatic status:** watching an episode moves a show to _Watching_; finishing
  every episode of a concluded show flips it to _Finished_ — no manual dropdown.
- **Timezone-correct calendar days:** the Upcoming/Watch List "today" cutoff uses
  each user's browser-detected timezone, not the server's UTC.
- **PWA:** installable, offline shell/image caching, effectively non-expiring
  login so the installed app doesn't ask you to sign in every launch.
- **Auth:** session-based (Laravel Fortify) with 2FA (TOTP) and passkeys. No
  self-registration — accounts are created by an admin via an artisan command.

## Tech Stack

| Layer         | Choice                                                        |
| ------------- | ------------------------------------------------------------- |
| Backend       | Laravel 13, PHP **8.5**                                       |
| Frontend      | Inertia.js v3 + React 19 + TypeScript, Tailwind v4, shadcn/ui |
| Routing/types | Laravel Wayfinder (typed route/controller helpers)            |
| Auth          | Laravel Fortify (2FA + passkeys)                              |
| Database      | PostgreSQL 17                                                 |
| Metadata      | TMDB (v3 API); pluggable provider interface (Trakt planned)   |
| PWA           | `vite-plugin-pwa` (Workbox)                                   |
| Jobs          | Database queue + scheduler (nightly TMDB refresh)             |
| Deploy        | Docker Compose behind an existing `cloudflared` tunnel        |
| Tests         | Pest v4                                                       |

## Requirements

- **PHP 8.5** (the project's platform requirement — `composer install` fails on
  8.4). On Herd for Windows the global `php` shim points at 8.4; use the
  `php85.bat` shim (e.g. `~/.config/herd/bin/php85.bat`) for `artisan`,
  `composer`, `test`, and `npm run build` (the Wayfinder Vite plugin shells out
  to `php artisan wayfinder:generate` during the build). `herd use 8.5` makes it
  the default.
- Node 22, npm.
- Docker + Docker Compose (for the containerized stack).
- A TMDB v3 API key — https://www.themoviedb.org/settings/api.

## Running with Docker (recommended)

The Compose stack is the same thing served in production — the site the app is
tested against runs at **http://localhost:8080**.

```bash
cp .env.example .env
# edit .env: set APP_KEY (php artisan key:generate), DB_PASSWORD, TMDB_API_KEY

docker compose up -d --build --remove-orphans
```

Services: `app` (PHP-FPM), `web` (nginx, exposes `${WEB_PORT:-8080}`), `db`
(Postgres, persisted in the `db_data` named volume), `scheduler`
(`schedule:work`), `queue` (`queue:work`). The `app` container runs migrations
on bring-up and its healthcheck passes once the DB is reachable and migrated.

> **Code is baked into the images** (no bind mounts). After changing PHP or
> frontend code, rebuild to see it: `docker compose up -d --build --remove-orphans`.

Because `.env` sets `DB_HOST=db` (a Compose-internal hostname), host-side
`php artisan` can't reach the database — run data/admin commands _inside_ the
container:

```bash
docker compose exec app php artisan app:make-user
```

Point your existing `cloudflared` tunnel at the `web` service / host port; the
tunnel terminates HTTPS, which service workers require. Set `APP_URL` to the
public HTTPS URL in that case.

## Database backups

The `scheduler` container can create plain-text PostgreSQL dumps on any standard
five-part cron schedule. It must remain running for scheduled dumps to execute.
Configure the feature in the Compose environment:

```env
DB_DUMP_ENABLED=true
DB_DUMP_CRON="0 2 * * *"
DB_DUMP_RETENTION_DAYS=7
DB_DUMP_PATH=/mnt/user/backups/tracker-app
```

`DB_DUMP_ENABLED=false` disables the scheduled task. `DB_DUMP_CRON` is evaluated
in the Laravel application timezone. An invalid value stops scheduler boot with
a clear configuration error. After each successful dump,
`DB_DUMP_RETENTION_DAYS` removes completed `.sql` files modified before the
start of the current application day minus the configured number of days. It
defaults to `7`; temporary and unrelated files are not removed. `DB_DUMP_PATH`
is a host path; Compose bind-mounts it into `/backups/database` in both the
`app` and `scheduler` containers. On Unraid, select a persistent share such as
`/mnt/user/backups/tracker-app` and ensure the container can write to it.

Run an immediate backup from the app container with:

```bash
docker compose exec app php artisan app:dump-database
```

Dumps use PostgreSQL's plain-text SQL format and are named
`{database}-YYYY-MM-DD_HHMMSS.sql`, for example
`tracker-2026-07-14_020000.sql`. Restore one with the PostgreSQL 17 client (the
command prompts for the database password):

```bash
docker compose exec app psql --host=db --port=5432 --username=tracker --dbname=tracker --file=/backups/database/tracker-2026-07-14_020000.sql
```

A database dump is a logical backup and is not the same as backing up
PostgreSQL's live data directory. Keep `DB_DUMP_PATH` separate from
`DB_DATA_LOCATION`, and include the selected Unraid backup share in your broader
backup strategy.

## Running on Unraid with Compose Manager Plus

This installation uses prebuilt images from GitHub Container Registry. It does
not require a repository checkout or an image build on the Unraid server.

1. In Compose Manager Plus, add a stack named `tracker-app`. Leave the external
   ENV and indirect-path fields blank, enable default Compose file discovery,
   and leave automatic override management enabled.
2. Paste [`docker-compose.unraid.yml`](docker-compose.unraid.yml) into the
   stack's Compose editor.
3. Paste [`.env.unraid.example`](.env.unraid.example) into the ENV editor and
   replace `APP_KEY`, `APP_URL`, `DB_PASSWORD`, and `TMDB_API_KEY`.
4. Ensure the `DB_DATA_LOCATION` directory is on persistent Unraid storage,
   then select **Compose Up**.
5. Create the first account from the app container with
   `php artisan app:make-user`.

The `latest` image tag follows `main`. Pushing a tag beginning with `v` also
publishes versioned `app` and `web` images; set `TRACKER_VERSION` to that tag to
pin an installation. The first published GHCR packages may need to be made
public from the repository owner's GitHub Packages settings before an
unauthenticated Unraid server can pull them.

## Local (non-Docker) development

```bash
composer install          # via php85
npm install
cp .env.example .env       # set DB_HOST=127.0.0.1 for a local Postgres
php artisan key:generate
php artisan migrate
composer run dev           # serves app + Vite + queue + logs
```

Yamtrack imports require a running queue worker. `composer run dev` includes
one; when running services separately, start `php artisan queue:work`.

If a frontend change isn't showing up, you likely need `npm run dev` (or
`npm run build`).

## Admin & data commands

Run inside the `app` container under Docker, or directly (php85) locally:

| Command                                   | Purpose                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `app:make-user`                           | Create a household account (`--name --email --password`, prompts if omitted).  |
| `app:track-show {tmdb} --user= --status=` | Find-or-create a TMDB show + full season/episode pull, track it for a user.    |
| `app:track-movie {tmdb} --user= --toggle` | Find-or-create a TMDB movie, track it, optionally mark watched.                |
| `tmdb:refresh`                            | Queue nightly refresh jobs for tracked shows/movies. Scheduled daily at 03:00. |
| `app:tmdb-probe`                          | Read-only smoke test of the TMDB provider (no DB writes).                      |

## Testing & quality

```bash
php artisan test --compact          # Pest (feature + unit)
vendor/bin/pint --dirty             # PHP formatting
composer run ci:check               # lint + format + phpstan + tests
```

Feature tests use their own DB config, so host-side `php artisan test` works
even when the app's `.env` points at the Compose-internal Postgres.

## Project layout

- `app/Models` — shared metadata (`Show`, `Season`, `Episode`, `Movie`,
  `MediaExternalId`) and per-user tracking (`UserShowTracking`,
  `UserEpisodeWatch`, `UserMovieTracking`).
- `app/Services/Metadata` — TMDB provider behind a `MediaMetadataProvider`
  interface, with typed DTOs.
- `app/Services/Library` — find-or-create media + tracking, and automatic
  show-status transitions.
- `app/Http/Controllers` — Inertia page + JSON detail endpoints.
- `resources/js/pages` — React/Inertia pages (`shows`, `movies`, `search`,
  `profile`, `*/upcoming`, `settings/*`, `auth/*`). The account, security, and
  appearance settings pages share the same responsive tracker shell as the main
  navigation and are launched from Profile.
- `routes/web.php`, `routes/settings.php`, `routes/console.php`.
- `docker/`, `Dockerfile`, `docker-compose.yml` — the container stack.
