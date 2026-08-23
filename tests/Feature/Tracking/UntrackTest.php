<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Models\Episode;
use App\Models\Movie;
use App\Models\Show;
use App\Models\User;

it('redirects guests away from untracking', function () {
    $show = Show::factory()->create();
    $movie = Movie::factory()->create();

    $this->delete(route('track.shows.destroy', $show))->assertRedirect(route('login'));
    $this->delete(route('track.movies.destroy', $movie))->assertRedirect(route('login'));
});

it('untracks a show and resets every one of this user\'s episode watches', function () {
    $user = User::factory()->create();
    $show = Show::factory()->create();
    $episodes = Episode::factory()->count(3)
        ->sequence(['episode_number' => 1], ['episode_number' => 2], ['episode_number' => 3])
        ->create(['show_id' => $show->id, 'season_number' => 1]);

    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);
    foreach ($episodes as $episode) {
        $user->episodeWatches()->create(['episode_id' => $episode->id, 'watched' => true, 'watched_date' => now()]);
    }

    $this->actingAs($user)
        ->deleteJson(route('track.shows.destroy', $show))
        ->assertOk()
        ->assertJsonPath('tracked', false);

    expect($user->showTrackings()->count())->toBe(0);
    expect($user->episodeWatches()->count())->toBe(0);
});

it('leaves other members\' tracking and watches alone when untracking a show', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();
    $show = Show::factory()->create();
    $episode = Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1]);

    foreach ([$user, $other] as $member) {
        $member->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);
        $member->episodeWatches()->create(['episode_id' => $episode->id, 'watched' => true, 'watched_date' => now()]);
    }

    $this->actingAs($user)->deleteJson(route('track.shows.destroy', $show))->assertOk();

    expect($other->showTrackings()->count())->toBe(1);
    expect($other->episodeWatches()->count())->toBe(1);
    // The shared show itself is untouched.
    expect(Show::count())->toBe(1);
});

it('is a no-op to untrack a show that was never tracked', function () {
    $user = User::factory()->create();
    $show = Show::factory()->create();

    $this->actingAs($user)
        ->deleteJson(route('track.shows.destroy', $show))
        ->assertOk();

    expect($user->showTrackings()->count())->toBe(0);
});

it('untracks a movie, which also resets its watched state', function () {
    $user = User::factory()->create();
    $movie = Movie::factory()->create();
    $user->movieTrackings()->create(['movie_id' => $movie->id, 'watched' => true, 'watched_date' => now()]);

    $this->actingAs($user)
        ->deleteJson(route('track.movies.destroy', $movie))
        ->assertOk()
        ->assertJsonPath('tracked', false);

    expect($user->movieTrackings()->count())->toBe(0);
    expect(Movie::count())->toBe(1);
});

it('leaves other members\' movie tracking alone when untracking', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();
    $movie = Movie::factory()->create();

    $user->movieTrackings()->create(['movie_id' => $movie->id]);
    $other->movieTrackings()->create(['movie_id' => $movie->id, 'watched' => true, 'watched_date' => now()]);

    $this->actingAs($user)->deleteJson(route('track.movies.destroy', $movie))->assertOk();

    expect($other->movieTrackings()->sole()->watched)->toBeTrue();
});
