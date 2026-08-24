<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;
use Inertia\Testing\AssertableInertia as Assert;
use Symfony\Component\Process\Process;

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

it('skips unconfigured module routes during normal application boot', function () {
    $process = new Process(
        [PHP_BINARY, base_path('artisan'), 'route:list', '--json'],
        base_path(),
        [
            'APP_ENV' => 'local',
            'APP_RUNNING_IN_CONSOLE' => 'true',
            'APP_URL' => 'http://tv.test',
            'TV_HOST' => 'tv.test',
            'SCHEDULE_HOST' => '',
            'PRESENCE_HOST' => '',
        ],
    );

    $process->mustRun();

    /** @var list<array{name: string|null, domain: string|null}> $routes */
    $routes = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
    $routesByName = collect($routes)->keyBy('name');

    expect($routesByName)
        ->toHaveKey('shows')
        ->not->toHaveKey('schedule.home')
        ->not->toHaveKey('presence.home')
        ->and($routesByName->get('shows')['domain'])->toBe('tv.test');
});

it('generates environment-neutral Wayfinder routes for every module', function () {
    $outputPath = storage_path('framework/testing/wayfinder-module-routes');

    File::deleteDirectory($outputPath);

    try {
        $process = new Process(
            [
                PHP_BINARY,
                base_path('artisan'),
                'wayfinder:generate',
                "--path={$outputPath}",
                '--skip-actions',
            ],
            base_path(),
            [
                'APP_ENV' => 'local',
                'APP_RUNNING_IN_CONSOLE' => 'true',
                'APP_URL' => 'http://tv.test',
                'TV_HOST' => 'tv.test',
                'SCHEDULE_HOST' => '',
                'PRESENCE_HOST' => '',
            ],
        );

        $process->mustRun();

        $generatedFiles = collect(File::allFiles($outputPath))
            ->map(fn (SplFileInfo $file): string => $file->getRelativePathname())
            ->implode(', ');

        expect(File::exists("{$outputPath}/routes/schedule/index.ts"))
            ->toBeTrue("Generated files: {$generatedFiles}")
            ->and(File::exists("{$outputPath}/routes/presence/index.ts"))
            ->toBeTrue("Generated files: {$generatedFiles}");

        $tvRoutes = File::get("{$outputPath}/routes/index.ts");
        $scheduleRoutes = File::get("{$outputPath}/routes/schedule/index.ts");
        $presenceRoutes = File::get("{$outputPath}/routes/presence/index.ts");

        expect($tvRoutes)
            ->toContain('export const home')
            ->toContain("url: '/',")
            ->not->toContain('tv.test')
            ->not->toContain('__wayfinder')
            ->and($scheduleRoutes)
            ->toContain('export const home')
            ->toContain("url: '/',")
            ->not->toContain('schedule.test')
            ->not->toContain('__wayfinder')
            ->and($presenceRoutes)
            ->toContain('export const home')
            ->toContain("url: '/',")
            ->not->toContain('presence.test')
            ->not->toContain('__wayfinder');
    } finally {
        File::deleteDirectory($outputPath);
    }
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

it('redirects successful logins through the current module root', function (
    string $host,
    string $component,
    ?string $redirectPath,
) {
    $user = User::factory()->create();

    $this->get("http://{$host}/login")
        ->assertOk()
        ->assertSessionMissing('url.intended');

    $loginResponse = $this->post("http://{$host}/login", [
        'email' => $user->email,
        'password' => 'password',
    ]);

    $loginResponse
        ->assertRedirect('/')
        ->assertSessionMissing('url.intended');
    $this->assertAuthenticatedAs($user);

    $rootResponse = $this->get("http://{$host}/");

    if ($redirectPath !== null) {
        $rootResponse->assertRedirect("http://{$host}{$redirectPath}");

        $this->get("http://{$host}{$redirectPath}")
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component($component));
    } else {
        $rootResponse
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component($component));
    }

    $this->assertAuthenticatedAs($user);
})->with([
    'TV Time' => ['tv.test', 'shows', '/shows'],
    'Schedule Board' => ['schedule.test', 'schedule/index', null],
    'US Presence' => ['presence.test', 'presence/index', null],
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
