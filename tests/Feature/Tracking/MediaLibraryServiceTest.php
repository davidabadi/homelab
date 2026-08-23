<?php

declare(strict_types=1);

use App\Models\Episode;
use App\Models\MediaExternalId;
use App\Models\Movie;
use App\Models\Season;
use App\Models\Show;
use App\Services\Library\MediaLibraryService;
use Illuminate\Support\Facades\Http;

it('creates a show with its full season and episode data on first track', function () {
    fakeTmdb();

    $show = app(MediaLibraryService::class)->findOrCreateShow(1399);

    expect($show->title)->toBe('Test Show')
        ->and($show->poster_image_url)->toBe('https://image.tmdb.org/t/p/w500/poster.jpg');

    expect(Season::where('show_id', $show->id)->count())->toBe(2);
    expect(Episode::where('show_id', $show->id)->count())->toBe(3);

    // Episode fields map through correctly, including a built still URL and a
    // blank air_date coerced to null.
    $ep1 = Episode::where('show_id', $show->id)->where('season_number', 1)->where('episode_number', 1)->first();
    expect($ep1->title)->toBe('Ep1')
        ->and($ep1->still_image_url)->toBe('https://image.tmdb.org/t/p/w500/s1e1.jpg')
        ->and($ep1->air_date->toDateString())->toBe('2020-01-01')
        ->and($ep1->runtime_minutes)->toBe(42);

    $ep2 = Episode::where('show_id', $show->id)->where('season_number', 1)->where('episode_number', 2)->first();
    expect($ep2->air_date)->toBeNull();

    // The TMDB id is recorded so the household never re-fetches this title.
    expect(MediaExternalId::where('media_type', 'show')->where('external_id', '1399')->where('media_id', $show->id)->exists())->toBeTrue();
});

it('reuses an existing show instead of re-fetching or duplicating', function () {
    fakeTmdb();
    $library = app(MediaLibraryService::class);

    $first = $library->findOrCreateShow(1399);
    Http::fake(); // any further TMDB call from here would return empty and break parsing
    $second = $library->findOrCreateShow(1399);

    expect($second->id)->toBe($first->id);
    expect(Show::count())->toBe(1);
    expect(Season::count())->toBe(2);
    expect(Episode::count())->toBe(3);
    expect(MediaExternalId::where('media_type', 'show')->count())->toBe(1);
});

it('creates a movie on first track and reuses it after', function () {
    fakeTmdb();
    $library = app(MediaLibraryService::class);

    $movie = $library->findOrCreateMovie(603);

    expect($movie->title)->toBe('The Matrix')
        ->and($movie->poster_image_url)->toBe('https://image.tmdb.org/t/p/w500/matrix.jpg')
        ->and($movie->release_date->toDateString())->toBe('1999-03-31')
        ->and($movie->runtime_minutes)->toBe(136);

    $again = $library->findOrCreateMovie(603);
    expect($again->id)->toBe($movie->id);
    expect(Movie::count())->toBe(1);
    expect(MediaExternalId::where('media_type', 'movie')->count())->toBe(1);
});
