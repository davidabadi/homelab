<?php

declare(strict_types=1);

use App\Models\Movie;
use App\Models\User;
use App\Models\UserMovieTracking;

it('redirects guests away from tracking a movie', function () {
    $this->post(route('track.movies.store'), ['tmdb_id' => 603])
        ->assertRedirect(route('login'));
});

it('tracks a movie as unwatched on first track', function () {
    fakeTmdb();
    $user = User::factory()->create();

    $response = $this->actingAs($user)->postJson(route('track.movies.store'), ['tmdb_id' => 603]);

    $response->assertCreated()
        ->assertJsonPath('tracking.watched', false)
        ->assertJsonPath('tracking.watched_date', null)
        ->assertJsonPath('movie.title', 'The Matrix');

    expect(Movie::count())->toBe(1);
    $this->assertDatabaseHas('user_movie_tracking', [
        'user_id' => $user->id,
        'watched' => false,
    ]);
});

it('is idempotent per user and does not duplicate the movie', function () {
    fakeTmdb();
    $user = User::factory()->create();

    $this->actingAs($user)->postJson(route('track.movies.store'), ['tmdb_id' => 603])->assertCreated();
    $this->actingAs($user)->postJson(route('track.movies.store'), ['tmdb_id' => 603])->assertOk();

    expect(Movie::count())->toBe(1);
    expect(UserMovieTracking::where('user_id', $user->id)->count())->toBe(1);
});

it('marks watched (count 0 → 1) stamping a watched_date, then resets it off', function () {
    $user = User::factory()->create();
    $movie = Movie::factory()->create();
    $tracking = $user->movieTrackings()->create(['movie_id' => $movie->id]);

    // Default action increments to a single watch.
    $this->actingAs($user)
        ->patchJson(route('track.movies.watched', $movie))
        ->assertOk()
        ->assertJsonPath('tracking.watched', true)
        ->assertJsonPath('tracking.watch_count', 1);

    $tracking->refresh();
    expect($tracking->watched)->toBeTrue()
        ->and($tracking->watch_count)->toBe(1)
        ->and($tracking->watched_date)->not->toBeNull();

    // Reset: watched false, count 0, watched_date cleared.
    $this->actingAs($user)
        ->patchJson(route('track.movies.watched', $movie), ['action' => 'reset'])
        ->assertOk()
        ->assertJsonPath('tracking.watched', false)
        ->assertJsonPath('tracking.watch_count', 0)
        ->assertJsonPath('tracking.watched_date', null);

    $tracking->refresh();
    expect($tracking->watched)->toBeFalse()
        ->and($tracking->watch_count)->toBe(0)
        ->and($tracking->watched_date)->toBeNull();
});

it('increments and collapses a movie watch count', function () {
    $user = User::factory()->create();
    $movie = Movie::factory()->create();

    $this->actingAs($user)->patchJson(route('track.movies.watched', $movie), ['action' => 'increment'])
        ->assertOk()->assertJsonPath('tracking.watch_count', 1);
    $this->actingAs($user)->patchJson(route('track.movies.watched', $movie), ['action' => 'increment'])
        ->assertOk()->assertJsonPath('tracking.watch_count', 2);

    // Collapse a run of rewatches back to a single watch.
    $this->actingAs($user)->patchJson(route('track.movies.watched', $movie), ['action' => 'set_once'])
        ->assertOk()->assertJsonPath('tracking.watch_count', 1)->assertJsonPath('tracking.watched', true);
});

it('auto-tracks an untracked movie when first marked watched', function () {
    $user = User::factory()->create();
    $movie = Movie::factory()->create();

    // No tracking row exists yet — marking watched should create one, then flip.
    expect(UserMovieTracking::where('user_id', $user->id)->count())->toBe(0);

    $this->actingAs($user)
        ->patchJson(route('track.movies.watched', $movie))
        ->assertOk()
        ->assertJsonPath('tracking.watched', true);

    $this->assertDatabaseHas('user_movie_tracking', [
        'user_id' => $user->id,
        'movie_id' => $movie->id,
        'watched' => true,
    ]);
    expect(UserMovieTracking::where('user_id', $user->id)->count())->toBe(1);
});

it('keeps each user\'s movie watched state isolated', function () {
    $owner = User::factory()->create();
    $intruder = User::factory()->create();
    $movie = Movie::factory()->create();
    $tracking = $owner->movieTrackings()->create(['movie_id' => $movie->id, 'watched' => false]);

    // The intruder toggling the same shared movie only ever affects their own
    // row — the owner's stays untouched.
    $this->actingAs($intruder)
        ->patchJson(route('track.movies.watched', $movie))
        ->assertOk()
        ->assertJsonPath('tracking.watched', true);

    expect($tracking->fresh()->watched)->toBeFalse();
    expect(UserMovieTracking::where('movie_id', $movie->id)->count())->toBe(2);
});
