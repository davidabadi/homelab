<?php

declare(strict_types=1);

use App\Models\MediaExternalId;
use App\Models\Movie;
use App\Models\User;
use Illuminate\Support\Facades\Http;

it('redirects guests away from a movie detail payload', function () {
    $movie = Movie::factory()->create();

    $this->get(route('movies.show', $movie))->assertRedirect(route('login'));
});

it('returns the movie with this user\'s watched state as JSON', function () {
    $user = User::factory()->create();
    $movie = Movie::factory()->create(['release_date' => '2026-12-18', 'runtime_minutes' => 142]);
    MediaExternalId::create(['media_type' => 'movie', 'media_id' => $movie->id, 'provider' => 'tmdb', 'external_id' => '603']);
    $user->movieTrackings()->create(['movie_id' => $movie->id, 'watched' => true, 'watched_date' => now()]);

    $this->actingAs($user)->getJson(route('movies.show', $movie))
        ->assertOk()
        ->assertJsonPath('movie.id', $movie->id)
        ->assertJsonPath('movie.title', $movie->title)
        ->assertJsonPath('movie.release_date', '2026-12-18')
        ->assertJsonPath('movie.runtime_minutes', 142)
        ->assertJsonPath('movie.tmdb_id', 603)
        ->assertJsonPath('tracked', true)
        ->assertJsonPath('watched', true)
        ->assertJsonPath('watchedDate', now()->toDateString());
});

it('never shows another member\'s watched state', function () {
    $movie = Movie::factory()->create();

    $other = User::factory()->create();
    $other->movieTrackings()->create(['movie_id' => $movie->id, 'watched' => true, 'watched_date' => now()]);

    $this->actingAs(User::factory()->create())->getJson(route('movies.show', $movie))
        ->assertOk()
        ->assertJsonPath('tracked', false)
        ->assertJsonPath('watched', false)
        ->assertJsonPath('watchedDate', null);
});

it('404s for a movie id that does not exist', function () {
    $this->actingAs(User::factory()->create())
        ->get('/movies/999999')
        ->assertNotFound();
});

/*
|--------------------------------------------------------------------------
| Franchise (TMDB collection) strip
|--------------------------------------------------------------------------
*/

it('includes the full franchise for a movie in a collection, the movie itself included', function () {
    fakeTmdb();
    $user = User::factory()->create();

    // Track The Matrix (603): creates the movie with its collection id.
    $this->actingAs($user)->postJson(route('track.movies.store'), ['tmdb_id' => 603])->assertCreated();
    $movie = Movie::sole();
    expect($movie->tmdb_collection_id)->toBe(2344);

    $this->actingAs($user)->getJson(route('movies.show', $movie))
        ->assertOk()
        ->assertJsonPath('collection.name', 'The Matrix Collection')
        // The whole run in release order — the current movie included, so the
        // client can highlight it in place.
        ->assertJsonCount(3, 'collection.movies')
        ->assertJsonPath('collection.movies.0.tmdb_id', 603)
        ->assertJsonPath('collection.movies.0.year', 1999)
        ->assertJsonPath('collection.movies.1.tmdb_id', 604)
        ->assertJsonPath('collection.movies.1.title', 'The Matrix Reloaded')
        ->assertJsonPath('collection.movies.2.tmdb_id', 605);
});

it('lazily resolves and persists the collection for a legacy movie row', function () {
    fakeTmdb();
    // A movie created before the collection column existed: linked to TMDB
    // but with a never-checked (null) collection id.
    $movie = Movie::factory()->create(['tmdb_collection_id' => null]);
    MediaExternalId::create(['media_type' => 'movie', 'media_id' => $movie->id, 'provider' => 'tmdb', 'external_id' => '603']);

    $this->actingAs(User::factory()->create())->getJson(route('movies.show', $movie))
        ->assertOk()
        ->assertJsonPath('collection.name', 'The Matrix Collection')
        ->assertJsonCount(3, 'collection.movies');

    expect($movie->refresh()->tmdb_collection_id)->toBe(2344);
});

it('persists "confirmed none" for a legacy movie outside any collection', function () {
    Http::fake([
        'api.themoviedb.org/3/movie/777*' => Http::response([
            'id' => 777, 'title' => 'Standalone', 'release_date' => '2001-01-01', 'runtime' => 100,
        ]),
    ]);

    $movie = Movie::factory()->create(['tmdb_collection_id' => null]);
    MediaExternalId::create(['media_type' => 'movie', 'media_id' => $movie->id, 'provider' => 'tmdb', 'external_id' => '777']);

    $this->actingAs(User::factory()->create())->getJson(route('movies.show', $movie))
        ->assertOk()
        ->assertJsonPath('collection', null);

    // 0 = checked, none — the lookup never repeats.
    expect($movie->refresh()->tmdb_collection_id)->toBe(0);
});

it('returns a null collection for a standalone movie', function () {
    $movie = Movie::factory()->create();

    $this->actingAs(User::factory()->create())->getJson(route('movies.show', $movie))
        ->assertOk()
        ->assertJsonPath('collection', null);
});

it('degrades the collection to null when TMDB is unreachable', function () {
    $movie = Movie::factory()->create(['tmdb_collection_id' => 999]);
    Http::fake(['api.themoviedb.org/*' => Http::response(null, 500)]);

    $this->actingAs(User::factory()->create())->getJson(route('movies.show', $movie))
        ->assertOk()
        ->assertJsonPath('movie.id', $movie->id)
        ->assertJsonPath('collection', null);
});
