<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Models\Episode;
use App\Models\Show;
use App\Models\User;

/**
 * A show with specials plus two regular seasons (S0: 1, S1: 3, S2: 2
 * episodes) for the catch-up endpoint tests.
 *
 * @return array{0: Show, 1: array<string, Episode>}
 */
function makeShowForWatchThrough(): array
{
    $show = Show::factory()->create();

    $episodes = [
        's0e1' => Episode::factory()->create(['show_id' => $show->id, 'season_number' => 0, 'episode_number' => 1]),
        's1e1' => Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1]),
        's1e2' => Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 2]),
        's1e3' => Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 3]),
        's2e1' => Episode::factory()->create(['show_id' => $show->id, 'season_number' => 2, 'episode_number' => 1]),
        's2e2' => Episode::factory()->create(['show_id' => $show->id, 'season_number' => 2, 'episode_number' => 2]),
    ];

    return [$show, $episodes];
}

it('redirects guests away from watch-through', function () {
    $episode = Episode::factory()->create();

    $this->patch(route('track.episodes.watchThrough', $episode))
        ->assertRedirect(route('login'));
});

it('marks the episode and every earlier one watched, across seasons, excluding specials', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeShowForWatchThrough();

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watchThrough', $episodes['s2e1']))
        ->assertOk()
        ->assertJsonPath('episodes_affected', 4);

    // S1E1–S1E3 and S2E1 are watched...
    foreach (['s1e1', 's1e2', 's1e3', 's2e1'] as $key) {
        $this->assertDatabaseHas('user_episode_watches', [
            'user_id' => $user->id, 'episode_id' => $episodes[$key]->id, 'watched' => true,
        ]);
    }
    // ...the special and the later episode are untouched.
    foreach (['s0e1', 's2e2'] as $key) {
        $this->assertDatabaseMissing('user_episode_watches', [
            'user_id' => $user->id, 'episode_id' => $episodes[$key]->id,
        ]);
    }
});

it('leaves already-watched episodes\' watched dates alone', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeShowForWatchThrough();

    $originalDate = now()->subWeek();
    $user->episodeWatches()->create([
        'episode_id' => $episodes['s1e1']->id, 'watched' => true, 'watched_date' => $originalDate,
    ]);

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watchThrough', $episodes['s1e3']))
        ->assertOk()
        ->assertJsonPath('episodes_affected', 2); // only s1e2 + s1e3 are new

    expect($user->episodeWatches()->where('episode_id', $episodes['s1e1']->id)->sole()->watched_date->toDateString())
        ->toBe($originalDate->toDateString());
});

it('auto-tracks and derives the show status like the single toggle', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeShowForWatchThrough();

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watchThrough', $episodes['s1e2']))
        ->assertOk();

    $this->assertDatabaseHas('user_show_tracking', [
        'user_id' => $user->id, 'show_id' => $show->id, 'status' => ShowStatus::Watching->value,
    ]);
});

it('finishes an ended show when catching up through the finale', function () {
    $user = User::factory()->create();
    $show = Show::factory()->ended()->create();
    Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1]);
    $finale = Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 2]);

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watchThrough', $finale))
        ->assertOk();

    expect($user->showTrackings()->sole()->status)->toBe(ShowStatus::Finished);
});
