<?php

declare(strict_types=1);

use App\Enums\YamtrackMediaType;
use App\Services\Importing\YamtrackCsvReader;

function yamtrackFixturePath(): string
{
    return dirname(__DIR__).'/Fixtures/yamtrack_import_development_fixture.csv';
}

it('parses the authoritative fixture exactly and preserves real-world semantics', function () {
    $reader = new YamtrackCsvReader;
    $errors = [];
    $rows = iterator_to_array($reader->rows(
        yamtrackFixturePath(),
        function (int $row, string $reason) use (&$errors): void {
            $errors[] = [$row, $reason];
        },
    ));

    expect($reader->headers(yamtrackFixturePath()))->toBe(YamtrackCsvReader::HEADERS)
        ->and($reader->countRows(yamtrackFixturePath()))->toBe(33)
        ->and($errors)->toBeEmpty()
        ->and(array_values(array_unique(array_map(fn ($row) => $row->mediaType->value, $rows))))
        ->toContain(
            YamtrackMediaType::Tv->value,
            YamtrackMediaType::Season->value,
            YamtrackMediaType::Episode->value,
            YamtrackMediaType::Movie->value,
        );

    $statuses = array_values(array_unique(array_filter(array_map(fn ($row) => $row->status, $rows))));
    expect($statuses)->toContain('completed', 'in progress', 'planning', 'paused', 'dropped');

    $seinfeldEpisode = collect($rows)->first(fn ($row) => $row->mediaId === 1400 && $row->mediaType === YamtrackMediaType::Episode);
    expect($seinfeldEpisode->seasonNumber)->toBe(1)
        ->and($seinfeldEpisode->episodeNumber)->toBe(1)
        ->and($seinfeldEpisode->watchedAt)->toBeNull();

    $brotherBear = collect($rows)->first(fn ($row) => $row->mediaId === 10009);
    $wallE = collect($rows)->first(fn ($row) => $row->mediaId === 10681);
    $luccasWorld = collect($rows)->first(fn ($row) => $row->mediaId === 1300607);
    expect($brotherBear->watchedAt?->toIso8601String())->toBe('2026-07-07T20:01:00+00:00')
        ->and($wallE->title)->toBe('WALL·E')
        ->and($luccasWorld->watchedAt?->toIso8601String())->toBe('2026-07-07T18:01:38+00:00')
        ->and(file_get_contents(yamtrackFixturePath()))->toContain('WALL·E', "Lucca's World");
});

it('skips malformed and unsupported rows without stopping the stream', function () {
    $path = tempnam(sys_get_temp_dir(), 'yamtrack-reader-');
    file_put_contents($path, implode("\n", [
        'media_id,source,media_type,season_number,episode_number',
        '1399,tmdb,episode,1,1',
        '1399,trakt,episode,1,2',
        'bad,tmdb,movie,,',
        '1399,tmdb,episode,,3',
    ]));

    $errors = [];
    $rows = iterator_to_array((new YamtrackCsvReader)->rows(
        $path,
        function (int $row, string $reason) use (&$errors): void {
            $errors[] = compact('row', 'reason');
        },
    ));
    @unlink($path);

    expect($rows)->toHaveCount(1)
        ->and($errors)->toHaveCount(3)
        ->and($errors[0]['row'])->toBe(3);
});

it('streams thousands of rows without assuming the development fixture size', function () {
    $path = tempnam(sys_get_temp_dir(), 'yamtrack-large-');
    $handle = fopen($path, 'wb');
    fwrite($handle, "media_id,source,media_type,season_number,episode_number\n");
    for ($episode = 1; $episode <= 5000; $episode++) {
        fwrite($handle, "1399,tmdb,episode,1,{$episode}\n");
    }
    fclose($handle);

    $reader = new YamtrackCsvReader;
    $count = 0;
    foreach ($reader->rows($path, fn () => null) as $row) {
        $count++;
        expect($row->mediaId)->toBe(1399);
    }
    @unlink($path);

    expect($count)->toBe(5000);
});
