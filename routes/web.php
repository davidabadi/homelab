<?php

use App\Http\Controllers\EpisodeController;
use App\Http\Controllers\EpisodeWatchController;
use App\Http\Controllers\MovieController;
use App\Http\Controllers\MovieTrackingController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\ShowController;
use App\Http\Controllers\ShowTrackingController;
use App\Http\Controllers\UpcomingController;
use App\Http\Controllers\WatchListController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

// Also the PWA start_url: logged-in household members land straight in the app.
Route::get('/', function () {
    return redirect()->route('shows');
})->name('home');

// Serve the built service worker from the site root. vite-plugin-pwa emits it
// into public/build (Vite's outDir), but a service worker's maximum scope is
// its own URL path — registered as /build/sw.js it could only ever control
// /build/*. Serving the same file at /sw.js gives it scope "/" without
// needing a Service-Worker-Allowed header on the web server.
Route::get('/sw.js', function () {
    $path = public_path('build/sw.js');

    abort_unless(file_exists($path), 404);

    return response()->file($path, [
        'Content-Type' => 'application/javascript; charset=utf-8',
        'Cache-Control' => 'no-cache, must-revalidate',
    ]);
})->name('pwa.service-worker');

// Serve the PWA manifest from the root as well: the service worker's precache
// list contains a relative "manifest.webmanifest" entry (appended by
// vite-plugin-pwa after URL transforms run), which the browser resolves
// against the service worker's own URL — /sw.js — i.e. to this path. A 404
// here would fail the entire precache install.
Route::get('/manifest.webmanifest', function () {
    $path = public_path('build/manifest.webmanifest');

    abort_unless(file_exists($path), 404);

    return response()->file($path, [
        'Content-Type' => 'application/manifest+json; charset=utf-8',
        'Cache-Control' => 'no-cache, must-revalidate',
    ]);
})->name('pwa.manifest');

// Simple health-check endpoint (in addition to Laravel's built-in /up).
// Verifies the app is booted and the database is reachable.
Route::get('/health', function () {
    try {
        DB::connection()->getPdo();
        $database = 'ok';
    } catch (Throwable $e) {
        return response()->json([
            'status' => 'error',
            'database' => 'unreachable',
        ], 503);
    }

    return response()->json([
        'status' => 'ok',
        'database' => $database,
        'time' => now()->toIso8601String(),
    ]);
})->name('health');

Route::middleware(['auth', 'verified'])->group(function () {
    // Main navigation shell (spec §5): Shows | Movies | Search | Profile. The
    // Shows/Movies tabs land on their Watch List sub-tab (spec §5, item 9).
    Route::get('shows', [WatchListController::class, 'shows'])->name('shows');
    Route::get('movies', [WatchListController::class, 'movies'])->name('movies');
    Route::get('search', [SearchController::class, 'index'])->name('search');
    Route::get('profile', [ProfileController::class, 'index'])->name('profile');
    Route::get('profile/library/shows', [ProfileController::class, 'shows'])
        ->name('profile.library.shows');
    Route::get('profile/library/movies', [ProfileController::class, 'movies'])
        ->name('profile.library.movies');

    // Watched History (spec Part 2 §3): cursor-paginated JSON, fetched on demand
    // as the user scrolls up on the Shows watch list — never part of that page's
    // initial payload. Literal path, so the numeric {show} route can't swallow it.
    Route::get('shows/watched-history', [WatchListController::class, 'history'])
        ->name('shows.watched-history');

    // Opening a search result (spec §5 Search): resolve a TMDB id to our own
    // Show/Movie row — creating it on first sight, idempotently — then redirect
    // into the JSON detail endpoint below (the modal's XHR follows it).
    Route::get('search/shows/{tmdbId}', [SearchController::class, 'openShow'])
        ->whereNumber('tmdbId')->name('search.shows.open');
    Route::get('search/movies/{tmdbId}', [SearchController::class, 'openMovie'])
        ->whereNumber('tmdbId')->name('search.movies.open');

    // Show/Movie detail payloads (spec §5, build item 11): JSON consumed by the
    // client-side detail modals. whereNumber keeps these from swallowing the
    // literal sibling paths (shows/upcoming etc.).
    Route::get('shows/{show}', [ShowController::class, 'show'])
        ->whereNumber('show')->name('shows.show');
    Route::get('movies/{movie}', [MovieController::class, 'show'])
        ->whereNumber('movie')->name('movies.show');
    // Episode Quick View payload (JSON), with previous/next ids for browsing.
    Route::get('episodes/{episode}', [EpisodeController::class, 'show'])
        ->whereNumber('episode')->name('episodes.show');

    // The starter kit's dashboard is superseded by the tab shell. The route
    // name sticks around because Fortify sends users here after login.
    Route::redirect('dashboard', '/shows')->name('dashboard');

    // Per-user show/movie tracking (spec §10 item 5). Every action is scoped to
    // the authenticated user inside the controllers; ids in the URL are only
    // ever resolved against the current user's own tracking rows.
    Route::post('track/shows', [ShowTrackingController::class, 'store'])
        ->name('track.shows.store');
    Route::patch('track/shows/{tracking}', [ShowTrackingController::class, 'update'])
        ->whereNumber('tracking')->name('track.shows.update');
    // Left-swipe status move (Watch Later / Stop Watching), keyed by shared show id.
    Route::patch('track/shows/{show}/status', [ShowTrackingController::class, 'setStatus'])
        ->whereNumber('show')->name('track.shows.status');
    // Left-swipe "Remove": drops the tracking row only, PRESERVING episode
    // watches (unlike destroy below, which wipes them).
    Route::delete('track/shows/{show}/tracking', [ShowTrackingController::class, 'removeFromList'])
        ->whereNumber('show')->name('track.shows.remove');
    // Untrack: removes this user's tracking row AND resets all their episode
    // watches for the show — keyed by the shared show id the UI knows.
    Route::delete('track/shows/{show}', [ShowTrackingController::class, 'destroy'])
        ->whereNumber('show')->name('track.shows.destroy');

    Route::post('track/movies', [MovieTrackingController::class, 'store'])
        ->name('track.movies.store');
    Route::delete('track/movies/{movie}', [MovieTrackingController::class, 'destroy'])
        ->name('track.movies.destroy');
    // Keyed by the shared movie id: auto-creates this user's tracking row if the
    // movie isn't tracked yet, then toggles watched (spec item 6 correction).
    Route::patch('track/movies/{movie}/watched', [MovieTrackingController::class, 'toggleWatched'])
        ->name('track.movies.watched');

    // Per-user episode watched state (spec §10 item 6). Keyed by shared
    // episode/show ids; the per-user watch rows are always scoped to the current
    // user inside the controller, which also auto-tracks the show as "watching".
    Route::patch('track/episodes/{episode}/watched', [EpisodeWatchController::class, 'toggle'])
        ->name('track.episodes.watched');
    // "Catch me up": mark this episode and every earlier one watched.
    Route::patch('track/episodes/{episode}/watch-through', [EpisodeWatchController::class, 'watchThrough'])
        ->name('track.episodes.watchThrough');
    Route::patch('track/shows/{show}/seasons/{season}/watched', [EpisodeWatchController::class, 'toggleSeason'])
        ->name('track.shows.seasons.watched');
    Route::get('track/shows/{show}/episodes', [EpisodeWatchController::class, 'index'])
        ->name('track.shows.episodes');

    // "Upcoming" sub-tabs (spec §5, build order item 10): future episodes/movies
    // from the shows and movies this user tracks, derived by query and scoped to
    // the current user inside the controller.
    Route::get('shows/upcoming', [UpcomingController::class, 'episodes'])
        ->name('shows.upcoming');
    // Aired-but-unwatched backlog above the future feed (cursor-paginated JSON,
    // fetched on demand as the user scrolls up). Literal path, so the numeric
    // {show} route can't swallow it.
    Route::get('shows/upcoming/backlog', [UpcomingController::class, 'episodeBacklog'])
        ->name('shows.upcoming.backlog');
    Route::get('movies/upcoming', [UpcomingController::class, 'movies'])
        ->name('movies.upcoming');
});

require __DIR__.'/settings.php';
