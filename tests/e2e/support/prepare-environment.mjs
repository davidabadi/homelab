import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const databasePath = resolve('database/e2e.sqlite');

if (!existsSync(databasePath)) {
    closeSync(openSync(databasePath, 'w'));
}

const environment = {
    ...process.env,
    APP_ENV: 'e2e',
    APP_KEY:
        process.env.APP_KEY ??
        'base64:MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=',
    APP_DEBUG: 'true',
    APP_URL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8000',
    APP_TIMEZONE: 'UTC',
    DB_CONNECTION: 'sqlite',
    DB_DATABASE: databasePath,
    BROADCAST_CONNECTION: 'null',
    CACHE_STORE: 'array',
    FILESYSTEM_DISK: 'local',
    MAIL_MAILER: 'array',
    QUEUE_CONNECTION: 'sync',
    SESSION_DRIVER: 'file',
    TMDB_API_KEY: '',
};

const php = process.env.E2E_PHP_BINARY ?? 'php';
const result = spawnSync(
    php,
    ['artisan', 'app:prepare-e2e', '--env=e2e', '--no-interaction'],
    {
        cwd: process.cwd(),
        env: environment,
        encoding: 'utf8',
        shell: process.platform === 'win32',
        stdio: 'inherit',
    },
);

if (result.error) {
    throw result.error;
}

process.exit(result.status ?? 1);
