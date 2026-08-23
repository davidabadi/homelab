<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Models\MediaExternalId;
use App\Models\Movie;
use App\Models\Show;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;

/**
 * Stub TMDB's multi-search with one show, one movie, and one person row —
 * the person must be filtered out of the results.
 */
function fakeTmdbSearch(): void
{
    Http::fake([
        'api.themoviedb.org/3/search/multi*' => Http::response([
            'results' => [
                ['media_type' => 'tv', 'id' => 1399, 'name' => 'Test Show', 'poster_path' => '/poster.jpg', 'first_air_date' => '2011-04-17'],
                ['media_type' => 'movie', 'id' => 603, 'title' => 'The Matrix', 'poster_path' => '/matrix.jpg', 'release_date' => '1999-03-30'],
                ['media_type' => 'person', 'id' => 500, 'name' => 'Some Actor'],
            ],
        ]),
    ]);
}

it('redirects guests away from search', function () {
    $this->get(route('search'))->assertRedirect(route('login'));
});

it('renders the search page without results when no query is given', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('search'))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('search')
            ->where('q', '')
            ->where('results', null)
            ->where('searchFailed', false)
        );
});

it('searches TMDB and returns shows and movies, never people', function () {
    fakeTmdbSearch();

    $this->actingAs(User::factory()->create())
        ->get(route('search', ['q' => 'test']))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('search')
            ->where('q', 'test')
            ->has('results', 2)
            ->where('results.0.tmdb_id', 1399)
            ->where('results.0.media_type', 'show')
            ->where('results.0.title', 'Test Show')
            ->where('results.0.year', 2011)
            ->where('results.0.poster_url', 'https://image.tmdb.org/t/p/w185/poster.jpg')
            ->where('results.0.library_id', null)
            ->where('results.0.tracked', false)
            ->where('results.1.tmdb_id', 603)
            ->where('results.1.media_type', 'movie')
            ->where('results.1.year', 1999)
            ->where('results.1.tracked', false)
        );
});

it('annotates results the household already has with this user\'s tracking', function () {
    fakeTmdbSearch();
    $user = User::factory()->create();

    $show = Show::factory()->create();
    MediaExternalId::create(['media_type' => 'show', 'media_id' => $show->id, 'provider' => 'tmdb', 'external_id' => '1399']);
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    $movie = Movie::factory()->create();
    MediaExternalId::create(['media_type' => 'movie', 'media_id' => $movie->id, 'provider' => 'tmdb', 'external_id' => '603']);
    $user->movieTrackings()->create(['movie_id' => $movie->id, 'watched' => true, 'watched_date' => now()]);

    $this->actingAs($user)
        ->get(route('search', ['q' => 'test']))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('search')
            ->where('results.0.library_id', $show->id)
            ->where('results.0.tracked', true)
            ->where('results.0.status', 'watching')
            ->where('results.1.library_id', $movie->id)
            ->where('results.1.tracked', true)
            ->where('results.1.watched', true)
        );
});

it('does not leak another member\'s tracking into the annotations', function () {
    fakeTmdbSearch();

    $show = Show::factory()->create();
    MediaExternalId::create(['media_type' => 'show', 'media_id' => $show->id, 'provider' => 'tmdb', 'external_id' => '1399']);

    $other = User::factory()->create();
    $other->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    // The show is in the household library, but THIS user does not track it.
    $this->actingAs(User::factory()->create())
        ->get(route('search', ['q' => 'test']))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('search')
            ->where('results.0.library_id', $show->id)
            ->where('results.0.tracked', false)
            ->where('results.0.status', null)
        );
});

it('degrades to a search-failed flag when TMDB is unreachable', function () {
    Http::fake([
        'api.themoviedb.org/*' => Http::response(null, 500),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('search', ['q' => 'test']))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('search')
            ->where('results', null)
            ->where('searchFailed', true)
        );
});

/*
|--------------------------------------------------------------------------
| Opening a result (search → detail)
|--------------------------------------------------------------------------
*/

it('opens a show from search by creating it on first sight and redirecting to its detail page', function () {
    fakeTmdb();
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get(route('search.shows.open', 1399));

    $show = Show::query()->sole();
    $response->assertRedirect(route('shows.show', $show, absolute: false));
    expect($show->episodes()->count())->toBe(3);

    // Opening again finds the same row — no duplicate, no re-fetch.
    $this->actingAs($user)->get(route('search.shows.open', 1399))
        ->assertRedirect(route('shows.show', $show, absolute: false));
    expect(Show::count())->toBe(1);
});

it('opens a movie from search the same way', function () {
    fakeTmdb();
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get(route('search.movies.open', 603));

    $movie = Movie::query()->sole();
    $response->assertRedirect(route('movies.show', $movie, absolute: false));

    $this->actingAs($user)->get(route('search.movies.open', 603))
        ->assertRedirect(route('movies.show', $movie, absolute: false));
    expect(Movie::count())->toBe(1);
});

it('does not track a show or movie merely by opening it', function () {
    fakeTmdb();
    $user = User::factory()->create();

    $this->actingAs($user)->get(route('search.shows.open', 1399));
    $this->actingAs($user)->get(route('search.movies.open', 603));

    expect($user->showTrackings()->count())->toBe(0);
    expect($user->movieTrackings()->count())->toBe(0);
});
