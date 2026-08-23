# Testing Tracker

Tracker uses three complementary test layers. Pest covers PHP behavior and
database rules, Node's test runner covers isolated frontend utilities, and
Playwright covers browser-visible workflows and frontend/backend integration.
Playwright does not provide PHP line coverage.

## Prerequisites

- PHP 8.5 and Composer
- Node.js 22 and npm
- Chromium installed with `npx playwright install chromium`

The E2E suite uses `database/e2e.sqlite`, never the normal development or
production database. SQLite was selected because all migrations and the
browser-visible query paths already run under the project's SQLite Pest suite;
there are no PostgreSQL-only operators in those paths. A file-backed database
is required because the Laravel server and Playwright processes must share it.

## Initial setup

```bash
composer install
npm ci
npx playwright install chromium
npm run build
```

`.env.e2e.example` documents the safe E2E settings. The Playwright runner
injects those settings directly, including the dedicated SQLite path, fake
mail/cache/queue drivers, and a non-production application key. Never point
`PLAYWRIGHT_BASE_URL` or the E2E database variables at production.

## Running Playwright

```bash
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:ui
npm run test:e2e:debug
npm run test:e2e:report
```

Every run calls the production-guarded `app:prepare-e2e` command, which performs
`migrate:fresh` and runs `E2ETestSeeder`. To reset data without running tests:

```bash
php artisan app:prepare-e2e --env=e2e --no-interaction
```

The setup project logs in through the real UI and writes reusable state to
`tests/e2e/.auth/user.json`. That directory, the SQLite database, HTML report,
JUnit output, traces, videos, and screenshots are ignored by Git. Inspect a
trace with `npx playwright show-trace test-results/path/to/trace.zip`.

The normal CI job runs desktop Chromium and a Pixel 7 mobile project with one
worker against the shared database. It retries once only in CI, captures a trace
on that retry, retains failure screenshots/videos, and always uploads the HTML
report, test results, and Laravel logs for 14 days. Run the workflow manually
with `full_browsers=true` to add desktop Firefox and WebKit.

No visual snapshot baselines are currently committed. When a focused visual
test is added, update only that test with `npx playwright test path/to/spec
--update-snapshots` and review the diff at every configured viewport.

The E2E environment binds `FakeMetadataProvider`, so search, detail creation,
collections, and Yamtrack imports never call TMDB.

## Coverage inventory

| Feature                                    | Pest                                         | Frontend unit                | Playwright                                                                                    | Intentional gaps                                                                                           |
| ------------------------------------------ | -------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Login, logout, password confirmation       | Auth feature tests                           | —                            | Valid/invalid login, required fields, logout/history, confirmation gate                       | Remember-cookie persistence, CSRF expiry, and email delivery remain below-browser or manual checks         |
| Email verification                         | Verification feature tests                   | —                            | Protected-route redirect behavior represented by current implementation                       | `User` does not currently implement `MustVerifyEmail`, so an unverified browser journey is not enforceable |
| Two-factor authentication                  | Challenge and security tests                 | —                            | Security UI and confirmation gate                                                             | TOTP setup/challenge and recovery codes stay below browser level                                           |
| Passkeys                                   | Fortify/security tests                       | —                            | Empty management UI                                                                           | Hardware-backed WebAuthn registration and unsupported-browser errors are intentionally not faked           |
| Navigation and shell                       | Navigation feature tests                     | —                            | Direct, Inertia, history, desktop, phone, narrow viewport, keyboard focus                     | Installed-PWA OS chrome is not automatable in CI                                                           |
| Shows and episodes                         | Controller, tracking, detail, upcoming tests | Watch-list layout algorithms | Watch list, history loading, upcoming, detail, seasons, episode quick view, responsive dialog | Pixel-perfect animation duration is not asserted                                                           |
| Movies and collections                     | Controller, tracking, detail, upcoming tests | —                            | Watched groups, upcoming, details, collection titles/fallbacks                                | Cross-browser collection layout is manual-workflow coverage                                                |
| Search                                     | Search feature tests                         | —                            | Debounce, deterministic results, detail, tracking, no TMDB traffic                            | Upstream TMDB failure shapes stay in service tests                                                         |
| Profile and libraries                      | Profile feature tests                        | —                            | Stats, recent media, library dialogs, user isolation                                          | Very large-library performance is not a PR check                                                           |
| Account and appearance                     | Settings feature tests                       | —                            | Profile update, theme persistence                                                             | Destructive account deletion is kept out of shared browser fixtures                                        |
| Yamtrack import                            | Request, processing, service tests           | —                            | File selection and synchronous E2E processing                                                 | Long-running queue recovery remains a job-level test                                                       |
| PWA                                        | Route/asset feature coverage                 | —                            | Manifest and service-worker root responses                                                    | Offline browser cache eviction and OS installation prompts are browser/OS dependent                        |
| Errors and accessibility-critical behavior | Exception/request tests                      | —                            | Page errors, console errors, HTTP 500s, roles, focus trap/return, overflow                    | A full WCAG audit requires dedicated tooling and human review                                              |

Run all non-browser checks with:

```bash
npm run lint:check
npm run format:check
npm run types:check
npm run test:frontend
npm run build
composer types:check
php artisan test
```
