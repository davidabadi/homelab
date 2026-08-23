<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\File;
use Inertia\Testing\AssertableInertia as Assert;

/*
|--------------------------------------------------------------------------
| Navigation shell (spec §5 / build order item 8)
|--------------------------------------------------------------------------
*/

it('redirects guests to login for every nav tab', function (string $routeName) {
    $this->get(route($routeName))->assertRedirect(route('login'));
})->with(['shows', 'movies', 'search', 'profile']);

it('renders each nav tab as its Inertia page for an authenticated user', function (string $page) {
    $this->actingAs(User::factory()->create())
        ->get(route($page))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia->component($page));
})->with(['shows', 'movies', 'search', 'profile']);

it('sends logged-in users from the home route into the app', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('home'))
        ->assertRedirect(route('shows', absolute: false));
});

it('redirects the legacy dashboard route into the app', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertRedirect('/shows');
});

/*
|--------------------------------------------------------------------------
| PWA routes (spec §8 / build order item 8)
|--------------------------------------------------------------------------
|
| sw.js and manifest.webmanifest are emitted by vite-plugin-pwa into
| public/build but must be served from the site root so the service worker
| gets scope "/". A build may not have run in this environment, so the tests
| stub the files when missing.
*/

function withBuiltPwaFile(string $relativePath, Closure $assertions): void
{
    $path = public_path($relativePath);
    $stubbed = ! File::exists($path);

    if ($stubbed) {
        File::ensureDirectoryExists(dirname($path));
        File::put($path, '// pwa test stub');
    }

    try {
        $assertions();
    } finally {
        if ($stubbed) {
            File::delete($path);
        }
    }
}

it('serves the built service worker from the site root', function () {
    withBuiltPwaFile('build/sw.js', function () {
        $this->get('/sw.js')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/javascript; charset=utf-8');
    });
});

it('serves the built manifest from the site root', function () {
    withBuiltPwaFile('build/manifest.webmanifest', function () {
        $this->get('/manifest.webmanifest')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    });
});

it('links the PWA manifest in the document head', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('shows'))
        ->assertSee('<link rel="manifest" href="/manifest.webmanifest">', escape: false);
});

it('uses the custom app icon as the favicon', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('shows'))
        ->assertSee('<link rel="icon" href="/icons/icon-192.png" type="image/png" sizes="192x192">', escape: false)
        ->assertSee('<link rel="apple-touch-icon" href="/icons/icon-192.png">', escape: false)
        ->assertDontSee('href="/favicon.ico"', escape: false)
        ->assertDontSee('href="/favicon.svg"', escape: false);
});

it('uses the Tracker branding throughout the React shell', function () {
    $icon = File::get(resource_path('js/components/app-logo-icon.tsx'));
    $trackerLayout = File::get(resource_path('js/layouts/tracker-layout.tsx'));

    expect($icon)
        ->toContain('bg-emerald-500/15')
        ->toContain('<Play')
        ->not->toContain('<img')
        ->and($trackerLayout)
        ->toContain('<AppLogoIcon')
        ->toContain('TV Time')
        ->not->toContain('Laravel Starter Kit');
});

it('renders settings with the tracker shell and no starter-kit app shell', function () {
    $app = File::get(resource_path('js/app.tsx'));
    $settingsLayout = File::get(resource_path('js/layouts/settings/layout.tsx'));

    expect($app)
        ->toContain('return [TrackerLayout, SettingsLayout]')
        ->not->toContain('AppLayout')
        ->and($settingsLayout)
        ->toContain('<PageScrollArea>')
        ->toContain("title: 'Account'")
        ->toContain("title: 'Security'")
        ->toContain("title: 'Appearance'");
});

it('keeps the Profile kebab menu inside settings and away from dashboard', function () {
    $profileMenu = File::get(resource_path('js/components/profile-menu.tsx'));

    expect($profileMenu)
        ->toContain("label: 'Account'")
        ->toContain("label: 'Security'")
        ->toContain("label: 'Appearance'")
        ->toContain('Log out')
        ->not->toContain('dashboard');
});

it('has removed the unreachable starter-kit pages and layouts', function () {
    expect(File::exists(resource_path('js/pages/dashboard.tsx')))->toBeFalse()
        ->and(File::exists(resource_path('js/pages/welcome.tsx')))->toBeFalse()
        ->and(File::exists(resource_path('js/layouts/app-layout.tsx')))->toBeFalse()
        ->and(File::exists(resource_path('js/layouts/app/app-sidebar-layout.tsx')))->toBeFalse()
        ->and(File::exists(resource_path('js/layouts/app/app-header-layout.tsx')))->toBeFalse();
});
