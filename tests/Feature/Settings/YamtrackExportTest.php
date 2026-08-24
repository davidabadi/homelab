<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Enums\YamtrackImportStatus;
use App\Enums\YamtrackImportStrategy;
use App\Models\Episode;
use App\Models\MediaExternalId;
use App\Models\Movie;
use App\Models\Show;
use App\Models\User;
use App\Models\YamtrackImport;
use App\Services\Importing\YamtrackCsvReader;
use App\Services\Importing\YamtrackImportService;
use Illuminate\Support\Facades\Storage;

it('requires authentication to export history', function () {
    $this->get(route('yamtrack-export'))->assertRedirect(route('login'));
});

it('exports the users history as an importable Yamtrack CSV', function () {
    $user = User::factory()->create();
    $show = Show::factory()->create(['title' => 'Comma, Show']);
    MediaExternalId::query()->create([
        'media_type' => 'show',
        'media_id' => $show->id,
        'provider' => 'tmdb',
        'external_id' => '1399',
    ]);
    $show->seasons()->create(['season_number' => 1, 'episode_count' => 2]);
    $watchedEpisode = Episode::factory()->create([
        'show_id' => $show->id,
        'season_number' => 1,
        'episode_number' => 1,
    ]);
    Episode::factory()->create([
        'show_id' => $show->id,
        'season_number' => 1,
        'episode_number' => 2,
    ]);
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);
    $user->episodeWatches()->create([
        'episode_id' => $watchedEpisode->id,
        'watched' => true,
        'watch_count' => 2,
        'watched_date' => '2026-08-20 15:30:00',
    ]);

    $movie = Movie::factory()->create(['title' => 'Exported Movie']);
    MediaExternalId::query()->create([
        'media_type' => 'movie',
        'media_id' => $movie->id,
        'provider' => 'tmdb',
        'external_id' => '603',
    ]);
    $user->movieTrackings()->create([
        'movie_id' => $movie->id,
        'watched' => true,
        'watch_count' => 1,
        'watched_date' => '2026-08-21 12:00:00',
    ]);

    $response = $this->actingAs($user)->get(route('yamtrack-export'));

    $response->assertOk()
        ->assertDownload('tracker-yamtrack-export-'.now()->toDateString().'.csv');
    $csv = $response->streamedContent();
    $path = tempnam(sys_get_temp_dir(), 'yamtrack-export-');
    expect($path)->not->toBeFalse();
    file_put_contents($path, $csv);

    try {
        $reader = new YamtrackCsvReader;
        $errors = [];
        $rows = iterator_to_array($reader->rows(
            $path,
            function (int $row, string $reason) use (&$errors): void {
                $errors[] = compact('row', 'reason');
            },
        ));

        expect($reader->headers($path))->toBe(YamtrackCsvReader::HEADERS)
            ->and($errors)->toBeEmpty()
            ->and($rows)->toHaveCount(4)
            ->and(collect($rows)->pluck('mediaId')->all())->toBe([1399, 1399, 1399, 603])
            ->and(collect($rows)->pluck('mediaType.value')->all())->toBe(['tv', 'season', 'episode', 'movie'])
            ->and($csv)->toContain('"Comma, Show"', 'Completed');

        Storage::fake('local');
        $storedPath = 'yamtrack-imports/round-trip.csv';
        Storage::disk('local')->put($storedPath, $csv);
        $recipient = User::factory()->create();
        $import = YamtrackImport::factory()->for($recipient)->create([
            'strategy' => YamtrackImportStrategy::Replace,
            'status' => YamtrackImportStatus::Processing,
            'stored_path' => $storedPath,
            'file_hash' => hash('sha256', $csv),
        ]);

        app(YamtrackImportService::class)->process($import);

        expect($recipient->showTrackings()->where('show_id', $show->id)->sole()->status)->toBe(ShowStatus::Watching)
            ->and($recipient->episodeWatches()->where('episode_id', $watchedEpisode->id)->sole()->watched)->toBeTrue()
            ->and($recipient->movieTrackings()->where('movie_id', $movie->id)->sole()->watched)->toBeTrue();
    } finally {
        unlink($path);
    }
});
