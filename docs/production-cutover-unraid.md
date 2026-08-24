# Unraid production cutover runbook

This runbook replaces the existing tracker and Schedule Board stacks with a
new Compose project named `homelab`. Keep both old stacks intact until the
rollback window has passed. Never attach the old and new PostgreSQL containers
to the same data directory.

## Final production shape

| Service | Purpose | Count |
| --- | --- | ---: |
| `app` | Laravel/PHP-FPM and the only automatic migration runner | 1 |
| `web` | nginx for TV Time, Schedule Board, and US Presence | 1 |
| `db` | PostgreSQL 17 on the new homelab data directory | 1 |
| `scheduler` | `php artisan schedule:work` | 1 |
| `queue` | `php artisan queue:work` | 1 |

All three public hostnames route to the same `web` port. Laravel selects the
module from the original Host header. Schedule data is stored in PostgreSQL;
its version 3 JSON remains the portable import/export format.

## Safety model

- Create a separate Compose Manager Plus stack named `homelab`.
- Use `/mnt/user/appdata/homelab/postgres` for its database. Do not reuse,
  rename, or copy a live PostgreSQL data directory while its server is running.
- Migrate tracker data with a restore-tested logical SQL dump.
- Preserve the tracker production `APP_KEY`, session settings, cookie name,
  and TV hostname. The restored `sessions` table plus the same key and cookie
  identity allow installed clients to retain their sessions.
- Leave the old tracker and Schedule Board stacks stopped but otherwise intact
  after cutover. They are the fast rollback path.
- Never run `down -v`, `volume rm`, `system prune`, or `migrate:fresh` during
  this procedure.

The database bind uses `create_host_path: false`. The directory must already
exist. With `REQUIRE_EXISTING_DATABASE=true`, PostgreSQL also refuses to start
unless the bind contains a cluster. The only exception is the deliberate,
one-time initialization described below.

## Production environment

Use `.env.unraid.example` as the canonical list. Fill these values from the
running tracker stack before the cutover:

- `APP_KEY`, `TMDB_API_KEY`, mail credentials, and other application secrets.
- `SESSION_COOKIE`, `SESSION_DOMAIN`, `SESSION_DRIVER`, lifetime, encryption,
  secure-cookie, and same-site settings.
- `APP_URL` and `TV_HOST`, preserving the existing TV HTTPS origin exactly.
- `WEB_PORT`, unless the new stack must temporarily use a separate validation
  port while the old tracker stack is still running.

The new database may use the `homelab` database/user/password shown in the
example; the logical dump is restored into that target. Use a new strong
password. Do not copy `DB_DATA_LOCATION` from the tracker stack.

Pin images produced by the same tested commit:

```env
APP_IMAGE_REPOSITORY=ghcr.io/davidabadi/homelab-app
WEB_IMAGE_REPOSITORY=ghcr.io/davidabadi/homelab-web
HOMELAB_VERSION=sha-<tested-commit>
```

Do not deploy `latest`. Confirm both packages and the selected tag exist and
are readable by Unraid before the maintenance window.

Capture the current session identity from the tracker app:

```bash
docker compose exec -T app php artisan config:show app.key
docker compose exec -T app php artisan config:show session
```

Treat the output as sensitive.

## Backups and rehearsal

Run these steps before the cutover window.

1. Export Schedule Board from **Backup / Restore → Download**. Keep two copies
   of the version 3 JSON outside its container and record resource/job counts.
2. Create a fresh tracker SQL dump:

   ```bash
   docker compose exec -T app php artisan app:dump-database
   ls -lht /mnt/user/backups/tracker-app/*.sql | head
   ```

3. Restore-test that exact file in disposable PostgreSQL 17. Substitute the
   real filename before running the commands:

   ```bash
   docker run -d --rm --name homelab-restore-test -e POSTGRES_PASSWORD=test-only -e POSTGRES_DB=homelab --tmpfs /var/lib/postgresql/data postgres:17-alpine
   until docker exec homelab-restore-test pg_isready --username postgres --dbname homelab; do sleep 1; done
   docker exec -i homelab-restore-test psql --username postgres --dbname homelab --set ON_ERROR_STOP=1 < /mnt/user/backups/tracker-app/<dump-file>.sql
   docker exec homelab-restore-test psql --username postgres --dbname homelab --set ON_ERROR_STOP=1 --command 'select count(*) as migrations from migrations; select count(*) as users from users;'
   docker stop homelab-restore-test
   ```

   The restore must report no SQL errors. Compare user and migration counts
   with production. Dumps produced by this repository omit ownership and
   privilege statements so they can restore under the new database role.

4. Create the empty host directories required by the new bind mounts and make
   them writable by the containers:

   ```bash
   mkdir -p /mnt/user/appdata/homelab/postgres
   mkdir -p /mnt/user/backups/homelab
   ```

5. Add the new `homelab` stack in Compose Manager Plus. During rehearsal use a
   free temporary `WEB_PORT`; do not change Cloudflare routes yet. Validate the
   rendered Compose configuration and verify the project name, image paths,
   pinned tag, database bind, and all three hosts:

   ```bash
   docker compose config --quiet
   docker compose config
   ```

## Final tracker dump

At the maintenance window, prevent new tracker writes and take the final dump:

```bash
docker compose stop scheduler queue
docker compose exec -T app php artisan down --with-secret
docker compose exec -T app php artisan app:dump-database
```

Restore-test this final file as above. Then stop the old tracker application
and database. Keep its Compose definition, database directory, images, and
backup files unchanged:

```bash
docker compose stop web app db
```

The old Schedule Board can remain running until its hostname is switched, but
do not edit its data after the final JSON export.

## Initialize and restore the new database

The new homelab directory is intentionally empty. In the homelab ENV set:

```env
RUN_MIGRATIONS=false
REQUIRE_EXISTING_DATABASE=false
```

Start only PostgreSQL and wait for it to become healthy:

```bash
docker compose up -d db
docker compose ps db
docker compose logs --tail=100 db
```

Restore the final tracker dump into the new database:

```bash
docker compose exec -T db psql --username homelab --dbname homelab --set ON_ERROR_STOP=1 < /mnt/user/backups/tracker-app/<final-dump-file>.sql
docker compose exec -T db psql --username homelab --dbname homelab --set ON_ERROR_STOP=1 --command 'select count(*) as migrations from migrations; select count(*) as users from users; select count(*) as sessions from sessions;'
```

If the dump is stored on a path not visible to the shell running Compose, copy
it to that machine first or pipe it over SSH. Do not add the old PostgreSQL
data directory as a second mount.

Stop the new database, then permanently restore the safety settings:

```env
RUN_MIGRATIONS=true
REQUIRE_EXISTING_DATABASE=true
```

```bash
docker compose stop db
docker compose config --quiet
docker compose up -d
```

The app now applies only migrations absent from the restored tracker
`migrations` table, including the Schedule and Presence schema. Do not seed.

## Validate before routing traffic

```bash
docker compose ps
docker compose logs --tail=200 db app web scheduler queue
docker compose exec -T app php artisan migrate:status
curl -fsS -H 'Host: <tv-host>' http://127.0.0.1:<WEB_PORT>/health
curl -I -H 'Host: <tv-host>' http://127.0.0.1:<WEB_PORT>/
curl -I -H 'Host: <schedule-host>' http://127.0.0.1:<WEB_PORT>/
curl -I -H 'Host: <presence-host>' http://127.0.0.1:<WEB_PORT>/
```

`/health` must report the application and database healthy. Each module root
must return the expected application or authentication response, not a 404.
Also verify that a tracker user, watched history, and the existing session rows
are present before changing Tunnel routes.

## Cloudflare Tunnel mapping

Route all three hostnames to `http://<unraid-lan-ip>:<WEB_PORT>`:

| Public hostname | Laravel module |
| --- | --- |
| Existing TV hostname | TV Time |
| Existing Schedule hostname | Schedule Board |
| Presence hostname | US Presence |

Preserve the Host header. Do not change the TV scheme, hostname, or public
port. After routing, verify HTTPS for all three modules.

## Schedule Board import

1. Sign in to the new Schedule module as the intended owner.
2. Open **Backup / Restore**, load the old version 3 JSON, and choose
   **Replace entire board** for the initially empty board.
3. Compare resources, jobs, labels, times, weekdays, assignments, notes,
   utilization, and conflict output with the old application.
4. Export the new board and store that JSON beside the original export.
5. Stop the old Schedule Board stack, but keep its configuration, bind mounts,
   image, and JSON intact through the rollback window.

## TV PWA and session checks

- Launch an already-installed PWA from its existing icon and confirm it stays
  signed in at the unchanged HTTPS origin.
- Navigate Shows, Movies, Search, Profile, and a detail page. Make one safe
  write and verify it persists after relaunch.
- Confirm `/manifest.webmanifest` and `/sw.js` return 200 on the TV hostname
  and are not advertised by Schedule or Presence.
- Confirm the worker controls the page and the manifest retains `id=/`,
  `scope=/`, `start_url=/`, and `display=standalone`.

A sign-out usually means `APP_KEY`, `SESSION_COOKIE`, `SESSION_DOMAIN`, the TV
origin, or the restored sessions differ from the old tracker stack.

## Rollback

1. Stop homelab `scheduler` and `queue`, place its app in maintenance mode, and
   take a failure-state SQL dump.
2. Point the TV Tunnel route back to the old tracker target and Schedule back
   to the old Schedule Board target. Disable Presence.
3. Restart the old stacks without changing their images, environment, database
   directory, or data files.
4. Verify TV and Schedule reads and writes before reopening access.

Writes made only in homelab after cutover will not exist in the old stacks.
Preserve the failure-state SQL and post-import Schedule JSON before rollback.
Do not restore either database over the other without a separate, explicit
data-reconciliation decision.

## Retire the old stacks

Retire the tracker and Schedule Board stacks only after:

- TV data, authentication, installed-PWA behavior, Schedule data, and all three
  Cloudflare routes have passed real-user validation.
- At least one scheduled homelab SQL dump has completed and been restore-tested.
- The original and post-import Schedule JSON files exist in two backed-up
  locations.
- The observation window has passed and everyone with rollback authority
  agrees the old data and runtime are no longer needed.

Archiving an old GitHub repository is separate from deleting its Unraid stack,
images, database directory, bind mounts, or Schedule JSON. Perform those as
explicit later actions, not as part of this cutover.
