<?php

use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

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
            $isGeneratingWayfinderRoutes = app()->runningInConsole()
                && in_array('wayfinder:generate', $_SERVER['argv'] ?? [], true);

            foreach ($moduleRoutes as $module => $routeFile) {
                $host = config("modules.hosts.{$module}");

                if (! is_string($host) || $host === '') {
                    continue;
                }

                $routes = Route::middleware('web');

                if (! $isGeneratingWayfinderRoutes) {
                    $routes->domain($host);
                }

                $routes->group($routeFile);
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
