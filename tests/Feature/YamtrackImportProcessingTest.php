<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Enums\YamtrackImportStatus;
use App\Enums\YamtrackImportStrategy;
use App\Jobs\ProcessYamtrackImport;
use App\Models\Episode;
use App\Models\Movie;
use App\Models\Show;
use App\Models\User;
use App\Models\YamtrackImport;
use App\Services\Importing\YamtrackImportService;
use App\Services\Library\MediaLibraryService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

function processYamtrackCsv(User $user, YamtrackImportStrategy $strategy, string $csv): YamtrackImport
{
    $path = 'yamtrack-imports/'.fake()->uuid().'.csv';
    Storage::disk('local')->put($path, $csv);
    $import = YamtrackImport::factory()->for($user)->create([
        'active_user_id' => $user->id,
        'strategy' => $strategy,
        'status' => YamtrackImportStatus::Pending,
        'stored_path' => $path,
        'file_hash' => hash('sha256', $csv),
    ]);

    (new ProcessYamtrackImport($import->id))->handle(app(YamtrackImportService::class));

    return $import->refresh();
}

function yamtrackCsv(array $rows): string
{
    return "media_id,source,media_type,title,image,season_number,episode_number,score,status,notes,start_date,end_date,progress,created_at,progressed_at\n"
        .implode("\n", $rows)."\n";
}

it('adds missing history idempotently without reducing counts dates statuses or app-only history', function () {
    Storage::fake('local');
    fakeTmdb();
    $library = app(MediaLibraryService::class);
    $show = $library->findOrCreateShow(1399);
    $movie = $library->findOrCreateMovie(603);
    $user = User::factory()->create();
    $tracking = $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::WatchLater]);
    $episodes = $show->episodes()->orderBy('episode_number')->get();
    $existingWatch = $user->episodeWatches()->create([
        'episode_id' => $episodes[0]->id,
        'watched' => true,
        'watch_count' => 3,
        'watched_date' => '2026-07-10 12:00:00',
    ]);
    $appOnlyWatch = $user->episodeWatches()->create([
        'episode_id' => $episodes[1]->id,
        'watched' => true,
        'watch_count' => 2,
        'watched_date' => '2026-07-11 12:00:00',
    ]);
    $movieTracking = $user->movieTrackings()->create([
        'movie_id' => $movie->id,
        'watched' => true,
        'watch_count' => 4,
        'watched_date' => '2026-07-12 12:00:00',
    ]);
    $csv = yamtrackCsv([
        '1399,tmdb,tv,Wrong title,,,,,Dropped,,,,,,',
        '1399,tmdb,episode,Wrong title,,1,1,,,,,2026-07-01 00:00:00+00:00,,,',
        '603,tmdb,movie,Wrong title,,,,,Completed,,,,,,2026-07-01 00:00:00+00:00',
    ]);

    $first = processYamtrackCsv($user, YamtrackImportStrategy::AddMissing, $csv);
    $second = processYamtrackCsv($user, YamtrackImportStrategy::AddMissing, $csv);

    expect($first->status)->toBe(YamtrackImportStatus::Completed)
        ->and($tracking->refresh()->status)->toBe(ShowStatus::WatchLater)
        ->and($existingWatch->refresh()->watch_count)->toBe(3)
        ->and($existingWatch->watched_date?->toDateTimeString())->toBe('2026-07-10 12:00:00')
        ->and($appOnlyWatch->refresh()->watch_count)->toBe(2)
        ->and($movieTracking->refresh()->watch_count)->toBe(4)
        ->and($second->episodes_marked_watched)->toBe(0)
        ->and($second->movies_marked_watched)->toBe(0)
        ->and(Show::count())->toBe(1)
        ->and(Movie::count())->toBe(1);
    Storage::disk('local')->assertMissing($first->stored_path);
});

it('replaces only the importing users history and leaves shared metadata and other users untouched', function () {
    Storage::fake('local');
    fakeTmdb();
    $library = app(MediaLibraryService::class);
    $show = $library->findOrCreateShow(1399);
    $movie = $library->findOrCreateMovie(603);
    $user = User::factory()->create();
    $other = User::factory()->create();
    $episodes = $show->episodes()->orderBy('episode_number')->get();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Stopped]);
    $keptWatch = $user->episodeWatches()->create(['episode_id' => $episodes[0]->id, 'watched' => true, 'watch_count' => 5]);
    $resetWatch = $user->episodeWatches()->create(['episode_id' => $episodes[1]->id, 'watched' => true, 'watch_count' => 2]);
    $movieTracking = $user->movieTrackings()->create(['movie_id' => $movie->id, 'watched' => true, 'watch_count' => 3]);

    $appOnlyShow = Show::factory()->create();
    $appOnlyEpisode = Episode::factory()->create(['show_id' => $appOnlyShow->id]);
    $user->showTrackings()->create(['show_id' => $appOnlyShow->id, 'status' => ShowStatus::Watching]);
    $appOnlyWatch = $user->episodeWatches()->create(['episode_id' => $appOnlyEpisode->id, 'watched' => true, 'watch_count' => 1]);
    $appOnlyMovie = Movie::factory()->create();
    $user->movieTrackings()->create(['movie_id' => $appOnlyMovie->id, 'watched' => true, 'watch_count' => 1]);

    $other->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);
    $otherWatch = $other->episodeWatches()->create(['episode_id' => $episodes[1]->id, 'watched' => true, 'watch_count' => 7]);
    $otherMovie = $other->movieTrackings()->create(['movie_id' => $movie->id, 'watched' => true, 'watch_count' => 6]);

    $csv = yamtrackCsv([
        '1399,tmdb,tv,Test Show,,,,,Completed,,,,,,',
        '1399,tmdb,season,Test Show,,1,,,Planning,,,,,,',
        '1399,tmdb,episode,Test Show,,1,1,,,,,2026-07-07 20:00:00+00:00,,,',
        '603,tmdb,movie,The Matrix,,,,,Planning,,,,,,',
    ]);
    $import = processYamtrackCsv($user, YamtrackImportStrategy::Replace, $csv);

    expect($import->status)->toBe(YamtrackImportStatus::Completed)
        ->and($user->showTrackings()->where('show_id', $show->id)->sole()->status)->toBe(ShowStatus::Watching)
        ->and($user->showTrackings()->where('show_id', $appOnlyShow->id)->exists())->toBeFalse()
        ->and($keptWatch->refresh()->watch_count)->toBe(1)
        ->and($keptWatch->watched_date?->toIso8601String())->toBe('2026-07-07T20:00:00+00:00')
        ->and($resetWatch->refresh()->watch_count)->toBe(0)
        ->and($resetWatch->watched_date)->toBeNull()
        ->and($appOnlyWatch->refresh()->watch_count)->toBe(0)
        ->and($movieTracking->refresh()->watch_count)->toBe(0)
        ->and($user->movieTrackings()->where('movie_id', $appOnlyMovie->id)->exists())->toBeFalse()
        ->and($otherWatch->refresh()->watch_count)->toBe(7)
        ->and($otherMovie->refresh()->watch_count)->toBe(6)
        ->and($show->fresh())->not->toBeNull()
        ->and($appOnlyShow->fresh())->not->toBeNull()
        ->and($appOnlyMovie->fresh())->not->toBeNull();

    $rerun = processYamtrackCsv($user, YamtrackImportStrategy::Replace, $csv);
    expect($rerun->episodes_reset)->toBe(0)
        ->and($rerun->movies_reset)->toBe(0)
        ->and($keptWatch->refresh()->watch_count)->toBe(1);
});

it('does not perform replacement mutations when parsing fails', function () {
    Storage::fake('local');
    fakeTmdb();
    $show = app(MediaLibraryService::class)->findOrCreateShow(1399);
    $user = User::factory()->create();
    $tracking = $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);
    $watch = $user->episodeWatches()->create([
        'episode_id' => $show->episodes()->firstOrFail()->id,
        'watched' => true,
        'watch_count' => 3,
    ]);
    $csv = yamtrackCsv(['1399,tmdb,episode,Test Show,,,,,,,,,,,']);

    $import = processYamtrackCsv($user, YamtrackImportStrategy::Replace, $csv);

    expect($import->status)->toBe(YamtrackImportStatus::Failed)
        ->and($import->failure_message)->toContain('invalid rows')
        ->and($import->skipped_rows)->toBe(1)
        ->and($import->error_summary)->toHaveCount(1)
        ->and($tracking->fresh())->not->toBeNull()
        ->and($watch->refresh()->watch_count)->toBe(3);
    Storage::disk('local')->assertMissing($import->stored_path);
});

it('completes additive imports with capped safe row errors', function () {
    Storage::fake('local');
    fakeTmdb();
    app(MediaLibraryService::class)->findOrCreateMovie(603);
    $user = User::factory()->create();
    $rows = ['603,tmdb,movie,The Matrix,,,,,Completed,,,,,,'];
    for ($index = 0; $index < 110; $index++) {
        $rows[] = '603,trakt,movie,The Matrix,,,,,Completed,,,,,,';
    }

    $import = processYamtrackCsv($user, YamtrackImportStrategy::AddMissing, yamtrackCsv($rows));

    expect($import->status)->toBe(YamtrackImportStatus::CompletedWithErrors)
        ->and($import->skipped_rows)->toBe(110)
        ->and($import->error_summary)->toHaveCount(100)
        ->and($import->error_summary[0])->toHaveKeys(['row', 'reason'])
        ->and($import->failure_message)->toBeNull();
});

it('continues a replacement and names TMDB media that cannot be resolved', function () {
    Storage::fake('local');
    fakeTmdb();
    $movie = app(MediaLibraryService::class)->findOrCreateMovie(603);
    Http::fake([
        'api.themoviedb.org/3/movie/1715017*' => Http::response([], 404),
    ]);
    $user = User::factory()->create();
    $csv = yamtrackCsv([
        '603,tmdb,movie,The Matrix,,,,,Completed,,,,,,',
        '1715017,tmdb,movie,The Missing Movie,,,,,Planning,,,,,,',
    ]);

    $import = processYamtrackCsv($user, YamtrackImportStrategy::Replace, $csv);

    expect($import->status)->toBe(YamtrackImportStatus::CompletedWithErrors)
        ->and($import->failure_message)->toBeNull()
        ->and($import->processed_rows)->toBe(2)
        ->and($import->successful_rows)->toBe(1)
        ->and($import->failed_rows)->toBe(1)
        ->and($import->error_summary)->toHaveCount(1)
        ->and($import->error_summary[0]['row'])->toBe(3)
        ->and($import->error_summary[0]['reason'])->toBe('TMDB movie "The Missing Movie" (1715017) could not be resolved.')
        ->and($user->movieTrackings()->where('movie_id', $movie->id)->sole()->watched)->toBeTrue();
});

it('persists progress as each unique media title is resolved', function () {
    Storage::fake('local');
    $user = User::factory()->create();
    $csv = yamtrackCsv([
        '603,tmdb,movie,First Movie,,,,,Planning,,,,,,',
        '604,tmdb,movie,Second Movie,,,,,Planning,,,,,,',
    ]);
    $path = 'yamtrack-imports/'.fake()->uuid().'.csv';
    Storage::disk('local')->put($path, $csv);
    $import = YamtrackImport::factory()->for($user)->create([
        'active_user_id' => $user->id,
        'strategy' => YamtrackImportStrategy::AddMissing,
        'status' => YamtrackImportStatus::Pending,
        'stored_path' => $path,
        'file_hash' => hash('sha256', $csv),
    ]);
    $observedProgress = [];

    Http::fake(function (Request $request) use ($import, &$observedProgress) {
        $observedProgress[] = $import->fresh()->processed_rows;
        $tmdbId = str_contains($request->url(), '/movie/603') ? 603 : 604;

        return Http::response([
            'id' => $tmdbId,
            'title' => $tmdbId === 603 ? 'First Movie' : 'Second Movie',
            'poster_path' => null,
            'overview' => null,
            'release_date' => null,
            'runtime' => null,
            'belongs_to_collection' => null,
        ]);
    });

    (new ProcessYamtrackImport($import->id))->handle(app(YamtrackImportService::class));

    expect($observedProgress)->toBe([0, 1])
        ->and($import->refresh()->processed_rows)->toBe(2)
        ->and($import->total_rows)->toBe(2)
        ->and($import->status)->toBe(YamtrackImportStatus::Completed);
});
