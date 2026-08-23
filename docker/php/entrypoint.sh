#!/bin/sh
set -e

cd /var/www/html

# Recreate framework dirs in case a mounted volume shadowed them, and make
# sure the runtime user can write to them.
mkdir -p \
    storage/framework/cache \
    storage/framework/sessions \
    storage/framework/views \
    storage/logs \
    bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache 2>/dev/null || true

# Only the "app" service sets RUN_MIGRATIONS=true, so migrations run exactly
# once per stack bring-up rather than racing across app/scheduler/queue.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
    echo "[entrypoint] Running database migrations..."
    php artisan migrate --force
fi

# Pick up runtime env provided by docker-compose (config is not baked).
php artisan config:clear >/dev/null 2>&1 || true

exec "$@"
