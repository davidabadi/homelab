<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
});

it('serves the existing TV module on its configured host', function () {
    $this->actingAs(User::factory()->create())
        ->get('http://tv.test/shows')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('shows'));
});

it('registers every module route under its configured domain', function () {
    expect(Route::getRoutes()->getByName('shows')?->getDomain())->toBe('tv.test')
        ->and(Route::getRoutes()->getByName('schedule.home')?->getDomain())->toBe('schedule.test')
        ->and(Route::getRoutes()->getByName('presence.home')?->getDomain())->toBe('presence.test');
});

it('keeps shared Fortify login available on every module host', function (string $host) {
    $this->get("http://{$host}/login")->assertOk();
})->with(['tv.test', 'schedule.test', 'presence.test']);

it('does not expose TV routes on future module hosts', function (string $host) {
    $this->actingAs(User::factory()->create())
        ->get("http://{$host}/shows")
        ->assertNotFound();
})->with(['schedule.test', 'presence.test']);

it('routes each future module host to its own placeholder page', function (
    string $host,
    string $component,
) {
    $this->actingAs(User::factory()->create())
        ->get("http://{$host}/")
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component($component));
})->with([
    'schedule' => ['schedule.test', 'schedule/index'],
    'presence' => ['presence.test', 'presence/index'],
]);

it('keeps the TV service worker and manifest on the TV host only', function (
    string $path,
    string $builtFile,
) {
    $builtPath = public_path("build/{$builtFile}");
    $stubbed = ! File::exists($builtPath);

    if ($stubbed) {
        File::ensureDirectoryExists(dirname($builtPath));
        File::put($builtPath, '// module domain test stub');
    }

    try {
        $this->get("http://tv.test/{$path}")->assertOk();
        $this->get("http://schedule.test/{$path}")->assertNotFound();
        $this->get("http://presence.test/{$path}")->assertNotFound();
    } finally {
        if ($stubbed) {
            File::delete($builtPath);
        }
    }
})->with([
    'service worker' => ['sw.js', 'sw.js'],
    'manifest' => ['manifest.webmanifest', 'manifest.webmanifest'],
]);

it('advertises the TV manifest only from documents served by the TV host', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get('http://tv.test/shows')
        ->assertSee('<link rel="manifest" href="/manifest.webmanifest">', escape: false)
        ->assertSee('data-app-module="tv"', escape: false);

    $this->actingAs($user)
        ->get('http://schedule.test/')
        ->assertDontSee('rel="manifest"', escape: false)
        ->assertSee('data-app-module="schedule"', escape: false);

    $this->actingAs($user)
        ->get('http://presence.test/')
        ->assertDontSee('rel="manifest"', escape: false)
        ->assertSee('data-app-module="presence"', escape: false);
});

it('uses explicit layouts and limits service worker registration to TV documents', function () {
    $app = File::get(resource_path('js/app.tsx'));

    expect($app)
        ->toContain("case name.startsWith('auth/'):")
        ->toContain("case name.startsWith('schedule/'):")
        ->toContain('return ScheduleLayout')
        ->toContain("case name.startsWith('presence/'):")
        ->toContain('return PresenceLayout')
        ->toContain('No layout configured for Inertia page')
        ->toContain("document.documentElement.dataset.appModule === 'tv'");
});

it('keeps existing authenticated TV navigation on the TV host', function () {
    $this->actingAs(User::factory()->create())
        ->get('http://tv.test/profile')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('profile'));
});
