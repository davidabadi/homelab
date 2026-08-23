<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Models\Episode;
use App\Models\Season;
use App\Models\Show;
use App\Models\User;
use App\Models\UserShowTracking;

it('redirects guests away from tracking a show', function () {
    $this->post(route('track.shows.store'), ['tmdb_id' => 1399])
        ->assertRedirect(route('login'));
});

it('tracks a show and pulls its full season/episode data on first track', function () {
    fakeTmdb();
    $user = User::factory()->create();

    $response = $this->actingAs($user)->postJson(route('track.shows.store'), ['tmdb_id' => 1399]);

    $response->assertCreated()
        ->assertJsonPath('tracking.status', 'watching')
        ->assertJsonPath('show.seasons', 2)
        ->assertJsonPath('show.episodes', 3);

    expect(Show::count())->toBe(1);
    expect(Season::count())->toBe(2);
    expect(Episode::count())->toBe(3);

    $this->assertDatabaseHas('user_show_tracking', [
        'user_id' => $user->id,
        'status' => 'watching',
    ]);
});

it('always tracks a new show as watching', function () {
    fakeTmdb();
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson(route('track.shows.store'), ['tmdb_id' => 1399, 'status' => 'watch_later'])
        ->assertCreated()
        ->assertJsonPath('tracking.status', 'watching');
});

it('ignores a status supplied while tracking', function () {
    fakeTmdb();
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson(route('track.shows.store'), ['tmdb_id' => 1399, 'status' => 'bogus'])
        ->assertCreated()
        ->assertJsonPath('tracking.status', 'watching');
});

it('is idempotent per user and does not duplicate the show', function () {
    fakeTmdb();
    $user = User::factory()->create();

    $this->actingAs($user)->postJson(route('track.shows.store'), ['tmdb_id' => 1399])->assertCreated();
    $this->actingAs($user)->postJson(route('track.shows.store'), ['tmdb_id' => 1399, 'status' => 'finished'])->assertOk();

    expect(Show::count())->toBe(1);
    expect(UserShowTracking::where('user_id', $user->id)->count())->toBe(1);
    expect(UserShowTracking::where('user_id', $user->id)->first()->status)->toBe(ShowStatus::Watching);
});

it('updates the status of the user\'s own tracked show', function () {
    $user = User::factory()->create();
    $show = Show::factory()->create();
    $tracking = $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::WatchLater]);

    $this->actingAs($user)
        ->patchJson(route('track.shows.update', $tracking), ['status' => 'finished'])
        ->assertOk()
        ->assertJsonPath('tracking.status', 'finished');

    expect($tracking->fresh()->status)->toBe(ShowStatus::Finished);
});

it('does not let a user update another user\'s show tracking', function () {
    $owner = User::factory()->create();
    $intruder = User::factory()->create();
    $show = Show::factory()->create();
    $tracking = $owner->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::WatchLater]);

    $this->actingAs($intruder)
        ->patchJson(route('track.shows.update', $tracking), ['status' => 'finished'])
        ->assertNotFound();

    // The owner's row is untouched.
    expect($tracking->fresh()->status)->toBe(ShowStatus::WatchLater);
});
