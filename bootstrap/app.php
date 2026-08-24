<?php

use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function (): void {
            $moduleRoutes = [
                'tv' => base_path('routes/tv.php'),
                'schedule' => base_path('routes/schedule.php'),
                'presence' => base_path('routes/presence.php'),
            ];

            // Wayfinder routes must remain relative because the same compiled
            // image is deployed behind environment-specific hostnames.
            $isGeneratingWayfinderRoutes = ($_SERVER['argv'][1] ?? null) === 'wayfinder:generate';

            foreach ($moduleRoutes as $module => $routeFile) {
                $host = config("modules.hosts.{$module}");

                if ($isGeneratingWayfinderRoutes) {
                    // Keep identical module roots from replacing each other in
                    // the route collection, then restore their real relative URIs.
                    $routeCount = count(Route::getRoutes()->getRoutes());
                    $generationPrefix = "__wayfinder/{$module}";

                    Route::middleware('web')
                        ->prefix($generationPrefix)
                        ->group($routeFile);

                    foreach (array_slice(Route::getRoutes()->getRoutes(), $routeCount) as $route) {
                        $route->setUri(Str::after($route->uri(), $generationPrefix) ?: '/');
                    }

                    continue;
                }

                if (! is_string($host) || $host === '') {
                    continue;
                }

                Route::middleware('web')
                    ->domain($host)
                    ->group($routeFile);
            }
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        $middleware->web(append: [
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
