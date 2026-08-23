<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Jobs\RefreshMovieMetadata;
use App\Jobs\RefreshShowMetadata;
use App\Models\Episode;
use App\Models\MediaExternalId;
use App\Models\Movie;
use App\Models\Season;
use App\Models\Show;
use App\Models\User;
use App\Services\Library\MediaLibraryService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

/**
 * Attach a TMDB external id to a shared Show/Movie row so the refresh path can
 * resolve which upstream record to re-fetch.
 */
function linkTmdb(Show|Movie $media, int $tmdbId): void
{
    MediaExternalId::create([
        'media_type' => $media instanceof Show ? 'show' : 'movie',
        'media_id' => $media->id,
        'provider' => 'tmdb',
        'external_id' => (string) $tmdbId,
    ]);
}

/*
|--------------------------------------------------------------------------
| Service: show refresh (scope item 1 — shows)
|--------------------------------------------------------------------------
*/

it('refreshes a show: updates air_date/runtime and picks up new episodes and seasons', function () {
    // Existing library state: one season with two episodes. S1E1 has stale
    // runtime; S1E2 has no confirmed air_date yet.
    $show = Show::factory()->create();
    linkTmdb($show, 1399);
    Season::create(['show_id' => $show->id, 'season_number' => 1, 'episode_count' => 2]);
    Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1,
        'air_date' => '2020-01-01', 'runtime_minutes' => 42,
    ]);
    Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 2,
        'air_date' => null, 'runtime_minutes' => null,
    ]);

    // TMDB now reports S1 with a corrected E1 runtime, a confirmed E2 air_date,
    // a brand-new E3, plus an entirely new season 2.
    Http::fake([
        'api.themoviedb.org/3/tv/1399/season/1*' => Http::response(['episodes' => [
            ['season_number' => 1, 'episode_number' => 1, 'name' => 'Ep1', 'air_date' => '2020-01-01', 'runtime' => 48],
            ['season_number' => 1, 'episode_number' => 2, 'name' => 'Ep2', 'air_date' => '2020-01-08', 'runtime' => 45],
            ['season_number' => 1, 'episode_number' => 3, 'name' => 'Ep3 NEW', 'air_date' => '2020-01-15', 'runtime' => 44],
        ]]),
        'api.themoviedb.org/3/tv/1399/season/2*' => Http::response(['episodes' => [
            ['season_number' => 2, 'episode_number' => 1, 'name' => 'S2E1 NEW', 'air_date' => '2021-01-01', 'runtime' => 50],
        ]]),
        'api.themoviedb.org/3/tv/1399*' => Http::response([
            'id' => 1399, 'name' => 'Test Show', 'poster_path' => '/p.jpg',
            'seasons' => [['season_number' => 1], ['season_number' => 2]],
        ]),
    ]);

    app(MediaLibraryService::class)->refreshShow($show);

    // Corrected runtime on an existing episode.
    $e1 = Episode::where(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1])->firstOrFail();
    expect($e1->runtime_minutes)->toBe(48);

    // Newly-confirmed air_date on a previously-null episode.
    $e2 = Episode::where(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 2])->firstOrFail();
    expect($e2->air_date->toDateString())->toBe('2020-01-08');

    // Genuinely new episode picked up.
    $this->assertDatabaseHas('episodes', [
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 3, 'title' => 'Ep3 NEW',
    ]);

    // Genuinely new season + its episode picked up, and season_count cached.
    $this->assertDatabaseHas('seasons', ['show_id' => $show->id, 'season_number' => 2]);
    $this->assertDatabaseHas('episodes', [
        'show_id' => $show->id, 'season_number' => 2, 'episode_number' => 1, 'title' => 'S2E1 NEW',
    ]);

    // No duplication: refresh reconciled in place, it did not re-create rows.
    expect(Episode::where('show_id', $show->id)->count())->toBe(4);
    expect(Season::where('show_id', $show->id)->where('season_number', 1)->first()->episode_count)->toBe(3);
});

it('does nothing for a show with no TMDB link', function () {
    $show = Show::factory()->create();
    Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1]);
    Http::fake();

    app(MediaLibraryService::class)->refreshShow($show);

    Http::assertNothingSent();
    expect(Episode::where('show_id', $show->id)->count())->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Service: movie refresh (scope item 1 — movies)
|--------------------------------------------------------------------------
*/

it('fills a movie\'s missing release_date and runtime from TMDB', function () {
    $movie = Movie::factory()->create(['release_date' => null, 'runtime_minutes' => null]);
    linkTmdb($movie, 603);
    Http::fake([
        'api.themoviedb.org/3/movie/603*' => Http::response([
            'id' => 603, 'title' => 'The Matrix', 'release_date' => '1999-03-31', 'runtime' => 136,
        ]),
    ]);

    app(MediaLibraryService::class)->refreshMovie($movie);

    expect($movie->fresh()->release_date->toDateString())->toBe('1999-03-31')
        ->and($movie->fresh()->runtime_minutes)->toBe(136);
});

it('treats a TMDB runtime of 0 as unconfirmed, not a real value to store', function () {
    // Unreleased film: TMDB has a release date but reports runtime 0. The 0 must
    // not be stored as a confirmed runtime — the movie keeps a null runtime and
    // stays eligible for a future refresh.
    $movie = Movie::factory()->create(['release_date' => null, 'runtime_minutes' => null]);
    linkTmdb($movie, 603);
    Http::fake([
        'api.themoviedb.org/3/movie/603*' => Http::response([
            'id' => 603, 'title' => 'Upcoming', 'release_date' => '2030-01-01', 'runtime' => 0,
        ]),
    ]);

    app(MediaLibraryService::class)->refreshMovie($movie);

    expect($movie->fresh()->release_date->toDateString())->toBe('2030-01-01')
        ->and($movie->fresh()->runtime_minutes)->toBeNull();
});

it('never overwrites a confirmed movie value with a null from TMDB', function () {
    // runtime already confirmed; release_date still missing. TMDB happens to
    // return a null runtime — the confirmed value must survive.
    $movie = Movie::factory()->create(['release_date' => null, 'runtime_minutes' => 136]);
    linkTmdb($movie, 603);
    Http::fake([
        'api.themoviedb.org/3/movie/603*' => Http::response([
            'id' => 603, 'title' => 'The Matrix', 'release_date' => '1999-03-31', 'runtime' => null,
        ]),
    ]);

    app(MediaLibraryService::class)->refreshMovie($movie);

    expect($movie->fresh()->runtime_minutes)->toBe(136)
        ->and($movie->fresh()->release_date->toDateString())->toBe('1999-03-31');
});

/*
|--------------------------------------------------------------------------
| Command fan-out (scope items 1 + 4 — queues one job per title)
|--------------------------------------------------------------------------
*/

it('queues a refresh job for every tracked show and skips untracked ones', function () {
    Queue::fake();
    $user = User::factory()->create();
    $other = User::factory()->create();

    $trackedByUser = Show::factory()->create();
    $user->showTrackings()->create(['show_id' => $trackedByUser->id, 'status' => ShowStatus::Watching]);

    // Tracked by a *different* user — still counts (any tracking row).
    $trackedByOther = Show::factory()->create();
    $other->showTrackings()->create(['show_id' => $trackedByOther->id, 'status' => ShowStatus::Finished]);

    // No tracking row at all — must be skipped.
    $untracked = Show::factory()->create();

    $this->artisan('tmdb:refresh')->assertSuccessful();

    Queue::assertPushed(RefreshShowMetadata::class, 2);
    Queue::assertPushed(RefreshShowMetadata::class, fn ($job) => $job->show->is($trackedByUser));
    Queue::assertPushed(RefreshShowMetadata::class, fn ($job) => $job->show->is($trackedByOther));
    Queue::assertNotPushed(RefreshShowMetadata::class, fn ($job) => $job->show->is($untracked));
});

it('queues a movie refresh only for tracked movies missing confirmed metadata', function () {
    Queue::fake();
    $user = User::factory()->create();

    // Tracked + fully confirmed → skipped (the skip-if-confirmed rule).
    $confirmed = Movie::factory()->create(['release_date' => '2000-01-01', 'runtime_minutes' => 120]);
    $user->movieTrackings()->create(['movie_id' => $confirmed->id]);

    // Tracked + missing runtime → queued.
    $missingRuntime = Movie::factory()->create(['release_date' => '2000-01-01', 'runtime_minutes' => null]);
    $user->movieTrackings()->create(['movie_id' => $missingRuntime->id]);

    // Tracked + missing release_date → queued.
    $missingRelease = Movie::factory()->create(['release_date' => null, 'runtime_minutes' => 120]);
    $user->movieTrackings()->create(['movie_id' => $missingRelease->id]);

    // Tracked + TMDB placeholder runtime of 0 → still unconfirmed, so queued.
    $zeroRuntime = Movie::factory()->create(['release_date' => '2030-01-01', 'runtime_minutes' => 0]);
    $user->movieTrackings()->create(['movie_id' => $zeroRuntime->id]);

    // Untracked + missing everything → skipped (nobody tracks it).
    Movie::factory()->create(['release_date' => null, 'runtime_minutes' => null]);

    $this->artisan('tmdb:refresh')->assertSuccessful();

    Queue::assertPushed(RefreshMovieMetadata::class, 3);
    Queue::assertPushed(RefreshMovieMetadata::class, fn ($job) => $job->movie->is($missingRuntime));
    Queue::assertPushed(RefreshMovieMetadata::class, fn ($job) => $job->movie->is($missingRelease));
    Queue::assertPushed(RefreshMovieMetadata::class, fn ($job) => $job->movie->is($zeroRuntime));
    Queue::assertNotPushed(RefreshMovieMetadata::class, fn ($job) => $job->movie->is($confirmed));
});
