# Homelab — Modular Laravel Applications

A single Laravel stack serving TV Time, Schedule Board, and US Presence. All
three modules share one PHP/nginx/PostgreSQL deployment and are selected by the
incoming hostname. TV Time remains an installable PWA on its existing origin.

For the production Unraid migration, database safeguards, Cloudflare mappings,
Schedule Board JSON import, and rollback procedure,
see [`docs/production-cutover-unraid.md`](docs/production-cutover-unraid.md).

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

Services: `app` (PHP-FPM), `web` (one nginx service exposing
`${WEB_PORT:-8080}` for every module hostname), `db`
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

Point every module route in the existing `cloudflared` tunnel at the same
`web` host port. Set `APP_URL` and `TV_HOST` to the unchanged TV hostname, then
set `SCHEDULE_HOST` and `PRESENCE_HOST` to their public hostnames.

## Database backups

The `scheduler` container can create plain-text PostgreSQL dumps on any standard
five-part cron schedule. It must remain running for scheduled dumps to execute.
Configure the feature in the Compose environment:

```env
DB_DUMP_ENABLED=true
DB_DUMP_CRON="0 2 * * *"
DB_DUMP_RETENTION_DAYS=7
DB_DUMP_PATH=/mnt/user/backups/homelab
```

`DB_DUMP_ENABLED=false` disables the scheduled task. `DB_DUMP_CRON` is evaluated
in the Laravel application timezone. An invalid value stops scheduler boot with
a clear configuration error. After each successful dump,
`DB_DUMP_RETENTION_DAYS` removes completed `.sql` files modified before the
start of the current application day minus the configured number of days. It
defaults to `7`; temporary and unrelated files are not removed. `DB_DUMP_PATH`
is a host path; Compose bind-mounts it into `/backups/database` in both the
`app` and `scheduler` containers. On Unraid, select a persistent share such as
`/mnt/user/backups/homelab` and ensure the container can write to it.

Run an immediate backup from the app container with:

```bash
docker compose exec app php artisan app:dump-database
```

Dumps use PostgreSQL's plain-text SQL format and are named
`{database}-YYYY-MM-DD_HHMMSS.sql`, for example
`homelab-2026-07-14_020000.sql`. Restore one with the PostgreSQL 17 client (the
command prompts for the database password):

```bash
docker compose exec app psql --host=db --port=5432 --username=homelab --dbname=homelab --file=/backups/database/homelab-2026-07-14_020000.sql
```

A database dump is a logical backup and is not the same as backing up
PostgreSQL's live data directory. Keep `DB_DUMP_PATH` separate from
`DB_DATA_LOCATION`, and include the selected Unraid backup share in your broader
backup strategy.

## Running on Unraid with Compose Manager Plus

This installation uses prebuilt images from GitHub Container Registry. It does
not require a repository checkout or an image build on the Unraid server.

1. Create a new Compose Manager Plus stack named `homelab`. Keep the old
   tracker and Schedule Board stacks intact through the rollback window.
2. Paste [`docker-compose.unraid.yml`](docker-compose.unraid.yml) into the
   stack's Compose editor.
3. Fill [`.env.unraid.example`](.env.unraid.example), preserving the tracker
   `APP_KEY`, session settings, cookie name, and TV origin. Use the new homelab
   database path; never share the old tracker PostgreSQL data directory.
4. Follow the backup, restore rehearsal, guarded database initialization, and
   cutover steps in the production runbook before routing traffic.
5. Confirm the restored tracker account and watched history before switching
   the Cloudflare routes. Use `php artisan app:make-user` only for a deliberate
   additional account.

The `latest` image tag follows `main`, but production should use a tested
`sha-*` or `v*` tag in `HOMELAB_VERSION`. Pushing a tag beginning with `v` also
publishes versioned `app` and `web` images. The first GHCR packages may need to
be made public from the repository owner's GitHub Packages settings before an
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
