import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8000';
const databasePath = path.resolve('database/e2e.sqlite');
const appEnvironment = {
    ...process.env,
    APP_ENV: 'e2e',
    APP_KEY:
        process.env.APP_KEY ??
        'base64:MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=',
    APP_DEBUG: 'true',
    APP_URL: baseURL,
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

const browserProjects = [
    {
        name: 'chromium',
        testIgnore: /.*\.mobile\.spec\.ts/,
        use: {
            ...devices['Desktop Chrome'],
            storageState: 'tests/e2e/.auth/user.json',
        },
        dependencies: ['setup'],
    },
    {
        name: 'mobile-chromium',
        testMatch: /.*\.mobile\.spec\.ts/,
        use: {
            ...devices['Pixel 7'],
            storageState: 'tests/e2e/.auth/user.json',
        },
        dependencies: ['setup'],
    },
];

if (process.env.PLAYWRIGHT_FULL_BROWSERS === 'true') {
    browserProjects.push(
        {
            name: 'firefox',
            testIgnore: /.*\.mobile\.spec\.ts/,
            use: {
                ...devices['Desktop Firefox'],
                storageState: 'tests/e2e/.auth/user.json',
            },
            dependencies: ['setup'],
        },
        {
            name: 'webkit',
            testIgnore: /.*\.mobile\.spec\.ts/,
            use: {
                ...devices['Desktop Safari'],
                storageState: 'tests/e2e/.auth/user.json',
            },
            dependencies: ['setup'],
        },
    );
}

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    timeout: 30_000,
    expect: { timeout: 7_500 },
    reporter: process.env.CI
        ? [
              ['line'],
              ['html', { open: 'never' }],
              ['junit', { outputFile: 'test-results/e2e-junit.xml' }],
          ]
        : [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL,
        locale: 'en-US',
        timezoneId: 'UTC',
        actionTimeout: 10_000,
        navigationTimeout: 15_000,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    outputDir: 'test-results/artifacts',
    webServer: {
        command: 'php artisan serve --env=e2e --host=127.0.0.1 --port=8000',
        url: `${baseURL}/health`,
        timeout: 30_000,
        reuseExistingServer: !process.env.CI,
        env: appEnvironment,
        stdout: 'pipe',
        stderr: 'pipe',
    },
    projects: [
        {
            name: 'setup',
            testMatch: /auth\.setup\.ts/,
        },
        ...browserProjects,
    ],
});
