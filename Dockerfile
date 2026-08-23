# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# base — PHP 8.5 FPM (glibc/bookworm) with the extensions Laravel + Postgres
# need. glibc is required so the prebuilt rollup/oxide/lightningcss native
# binaries (linux-x64-gnu) in package.json resolve during the asset build.
# ---------------------------------------------------------------------------
FROM php:8.5-fpm-bookworm AS base

# install-php-extensions resolves system deps and installs prebuilt/optimized
# PHP extensions reliably (more robust than compiling intl by hand).
ADD --chmod=0755 https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/
ADD --chmod=0644 https://www.postgresql.org/media/keys/ACCC4CF8.asc /usr/share/keyrings/postgresql.asc

RUN echo "deb [signed-by=/usr/share/keyrings/postgresql.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends git unzip postgresql-client-17 \
    && install-php-extensions pdo_pgsql pgsql zip intl bcmath pcntl opcache \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# ---------------------------------------------------------------------------
# vendor — PHP dependencies only (cached on composer.json/lock changes).
# Autoloader + scripts are deferred until the full source is present.
# ---------------------------------------------------------------------------
FROM base AS vendor

COPY composer.json composer.lock ./
RUN composer install \
        --no-dev --no-scripts --no-autoloader \
        --prefer-dist --no-interaction

# ---------------------------------------------------------------------------
# assets — compile the Vite/React bundle. Needs PHP + vendor because the
# Wayfinder Vite plugin shells out to `php artisan wayfinder:generate` during
# the build. This is `npm run build` (production), not `npm run dev`.
# ---------------------------------------------------------------------------
FROM base AS assets

# Node 22 (matches the local toolchain).
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=vendor /var/www/html/vendor ./vendor
COPY . .

# Dummy env so artisan can boot for Wayfinder route generation.
RUN cp .env.example .env \
    && composer dump-autoload --optimize --no-scripts \
    && php artisan package:discover --ansi \
    && php artisan key:generate --force

RUN npm ci && npm run build

# ---------------------------------------------------------------------------
# app — PHP-FPM runtime image (used by app, scheduler, queue services).
# ---------------------------------------------------------------------------
FROM base AS app

COPY --from=vendor /var/www/html/vendor ./vendor
COPY . .
COPY --from=assets /var/www/html/public/build ./public/build

RUN composer dump-autoload --no-dev --optimize --no-scripts \
    && php artisan package:discover --ansi \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

COPY docker/php/entrypoint.sh /usr/local/bin/entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint && chmod +x /usr/local/bin/entrypoint

EXPOSE 9000
ENTRYPOINT ["entrypoint"]
CMD ["php-fpm"]

# ---------------------------------------------------------------------------
# web — nginx serving the compiled public/ dir and proxying PHP to app:9000.
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS web

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=assets /var/www/html/public /var/www/html/public

EXPOSE 80
