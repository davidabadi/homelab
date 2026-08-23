<?php

declare(strict_types=1);

use App\Models\Episode;
use App\Models\Show;
use App\Models\User;

/**
 * A show with a special plus two regular seasons (S0: 1, S1: 2, S2: 1
 * episodes) for the quick-view payload tests.
 *
 * @return array{0: Show, 1: array<string, Episode>}
 */
function makeShowForQuickView(): array
{
    $show = Show::factory()->create();

    $episodes = [
        's0e1' => Episode::factory()->create(['show_id' => $show->id, 'season_number' => 0, 'episode_number' => 1]),
        's1e1' => Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1]),
        's1e2' => Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 2]),
        's2e1' => Episode::factory()->create(['show_id' => $show->id, 'season_number' => 2, 'episode_number' => 1]),
    ];

    return [$show, $episodes];
}

it('redirects guests away from an episode payload', function () {
    $episode = Episode::factory()->create();

    $this->get(route('episodes.show', $episode))->assertRedirect(route('login'));
});

it('returns the episode with this user\'s watched state and its show', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeShowForQuickView();
    $user->episodeWatches()->create(['episode_id' => $episodes['s1e1']->id, 'watched' => true, 'watched_date' => now()]);

    $this->actingAs($user)->getJson(route('episodes.show', $episodes['s1e1']))
        ->assertOk()
        ->assertJsonPath('episode.id', $episodes['s1e1']->id)
        ->assertJsonPath('episode.season_number', 1)
        ->assertJsonPath('episode.episode_number', 1)
        ->assertJsonPath('show.id', $show->id)
        ->assertJsonPath('show.title', $show->title)
        ->assertJsonPath('watched', true)
        ->assertJsonPath('watchedDate', now()->toDateString());
});

it('links previous/next in airing order across seasons, skipping specials', function () {
    $user = User::factory()->create();
    [, $episodes] = makeShowForQuickView();

    // First regular episode: no previous (the special does not count).
    $this->actingAs($user)->getJson(route('episodes.show', $episodes['s1e1']))
        ->assertOk()
        ->assertJsonPath('previousId', null)
        ->assertJsonPath('nextId', $episodes['s1e2']->id)
        ->assertJsonPath('position', 0)
        ->assertJsonPath('total', 3);

    // Season boundary: S1E2's next is S2E1.
    $this->actingAs($user)->getJson(route('episodes.show', $episodes['s1e2']))
        ->assertOk()
        ->assertJsonPath('previousId', $episodes['s1e1']->id)
        ->assertJsonPath('nextId', $episodes['s2e1']->id);

    // Last episode: no next.
    $this->actingAs($user)->getJson(route('episodes.show', $episodes['s2e1']))
        ->assertOk()
        ->assertJsonPath('previousId', $episodes['s1e2']->id)
        ->assertJsonPath('nextId', null);
});

it('never returns another member\'s watched state', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();
    [, $episodes] = makeShowForQuickView();

    $other->episodeWatches()->create(['episode_id' => $episodes['s1e1']->id, 'watched' => true, 'watched_date' => now()]);

    $this->actingAs($user)->getJson(route('episodes.show', $episodes['s1e1']))
        ->assertOk()
        ->assertJsonPath('watched', false)
        ->assertJsonPath('watchedDate', null);
});
