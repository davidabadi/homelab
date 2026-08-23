<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Http\Controllers\WatchListController;
use App\Models\Episode;
use App\Models\Movie;
use App\Models\Show;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Inertia\Testing\AssertableInertia as Assert;

/**
 * Create a show with sequential released episodes in season 1.
 *
 * @return array{0: Show, 1: Collection<int, Episode>}
 */
function makeReleasedShow(int $episodes = 3): array
{
    $show = Show::factory()->create();

    $eps = collect(range(1, $episodes))->map(fn (int $n): Episode => Episode::factory()->create([
        'show_id' => $show->id,
        'season_number' => 1,
        'episode_number' => $n,
        'air_date' => today()->subMonths($episodes - $n + 1),
    ]));

    return [$show, $eps];
}

it('redirects guests away from the shows watch list', function () {
    $this->get(route('shows'))->assertRedirect(route('login'));
});

it('treats an episode airing tomorrow (user\'s time) as unreleased, not watch-next', function () {
    // 8:30pm EDT on Sat 7/11 — already past midnight UTC. A naive UTC "today"
    // would count Sunday's still-unaired episode as released and surface the
    // fully-caught-up show as having something to watch next.
    Carbon::setTestNow(Carbon::parse('2026-07-12 00:30:00', 'UTC'));

    $user = User::factory()->create(['timezone' => 'America/New_York']);
    $show = Show::factory()->create();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    // Three aired episodes, all watched; the fourth airs Sunday (user's time).
    foreach ([1 => '2026-06-21', 2 => '2026-06-28', 3 => '2026-07-05'] as $number => $airDate) {
        $episode = Episode::factory()->create([
            'show_id' => $show->id, 'season_number' => 3, 'episode_number' => $number, 'air_date' => $airDate,
        ]);
        $user->episodeWatches()->create(['episode_id' => $episode->id, 'watched' => true, 'watch_count' => 1]);
    }
    Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 3, 'episode_number' => 4, 'air_date' => '2026-07-12',
    ]);

    // Caught up on everything released → drops off Watch Next entirely.
    $this->actingAs($user)->get(route('shows'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('shows')
            ->has('watchNext', 0)
            ->has('haventStarted', 0)
        );

    Carbon::setTestNow();
});

it('splits watching shows into Watch Next and Haven\'t Started by progress', function () {
    $user = User::factory()->create();

    // In progress: first episode watched, two still to go.
    [$started, $startedEps] = makeReleasedShow(3);
    $user->showTrackings()->create(['show_id' => $started->id, 'status' => ShowStatus::Watching]);
    $user->episodeWatches()->create(['episode_id' => $startedEps[0]->id, 'watched' => true, 'watch_count' => 1]);

    // No progress at all.
    [$fresh] = makeReleasedShow(5);
    $user->showTrackings()->create(['show_id' => $fresh->id, 'status' => ShowStatus::Watching]);

    $this->actingAs($user)->get(route('shows'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('shows')
            ->has('watchNext', 1)
            ->where('watchNext.0.show_id', $started->id)
            ->where('watchNext.0.episode.episode_number', 2) // next unwatched
            ->where('watchNext.0.remaining', 1) // one more after it
            ->has('haventStarted', 1)
            ->where('haventStarted.0.show_id', $fresh->id)
            ->where('haventStarted.0.remaining', 4)
            ->where('watchLaterCount', 0)
        );
});

it('orders Watch Next by the most recently watched show', function () {
    $user = User::factory()->create();
    [$older, $olderEps] = makeReleasedShow(3);
    [$newer, $newerEps] = makeReleasedShow(3);
    $user->showTrackings()->create(['show_id' => $older->id, 'status' => ShowStatus::Watching]);
    $user->showTrackings()->create(['show_id' => $newer->id, 'status' => ShowStatus::Watching]);
    $user->episodeWatches()->create(['episode_id' => $olderEps[0]->id, 'watched' => true, 'watch_count' => 1, 'watched_date' => now()->subDays(5)]);
    $user->episodeWatches()->create(['episode_id' => $newerEps[0]->id, 'watched' => true, 'watch_count' => 1, 'watched_date' => now()->subDay()]);

    $this->actingAs($user)->get(route('shows'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('watchNext', 2)
            ->where('watchNext.0.show_id', $newer->id)
            ->where('watchNext.1.show_id', $older->id)
        );
});

it('drops a fully caught-up watching show from the watch list', function () {
    $user = User::factory()->create();
    [$show, $eps] = makeReleasedShow(2);
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);
    $eps->each(fn (Episode $e) => $user->episodeWatches()->create([
        'episode_id' => $e->id, 'watched' => true, 'watch_count' => 1,
    ]));

    // Nothing left to watch next, so it simply doesn't appear anywhere.
    $this->actingAs($user)->get(route('shows'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('watchNext', 0)
            ->has('haventStarted', 0)
            ->missing('caughtUp')
        );
});

it('counts Watch Later shows but keeps their rows off the initial load', function () {
    $user = User::factory()->create();
    [$later] = makeReleasedShow(2);
    $user->showTrackings()->create(['show_id' => $later->id, 'status' => ShowStatus::WatchLater]);

    // The rows are an optional prop: the count is always present, but the rows
    // themselves are only evaluated when the inline section is revealed (partial
    // reload) — never on the initial page load.
    $this->actingAs($user)->get(route('shows'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('watchLaterCount', 1)
            ->missing('watchLater')
        );
});

it('builds Watch Later rows with their status and start episode', function () {
    $user = User::factory()->create();
    [$later, $eps] = makeReleasedShow(3);
    $user->showTrackings()->create(['show_id' => $later->id, 'status' => ShowStatus::WatchLater]);

    // Resolve the optional prop directly (bypassing Inertia's partial-reload
    // version handshake) and assert its shape.
    $controller = new WatchListController;
    $method = new ReflectionMethod($controller, 'watchLaterRows');
    $rows = $method->invoke($controller, $user);

    expect($rows)->toHaveCount(1);
    expect($rows[0]['show_id'])->toBe($later->id);
    expect($rows[0]['status'])->toBe('watch_later');
    expect($rows[0]['episode']['episode_number'])->toBe(1); // where they'd start
});

it('promotes a Watch Later show into the authoritative Watch Next response after a watch', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeReleasedShow(3);
    $tracking = $user->showTrackings()->create([
        'show_id' => $show->id,
        'status' => ShowStatus::WatchLater,
    ]);

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watched', $episodes->first()), ['action' => 'increment'])
        ->assertOk();

    expect($tracking->fresh()->status)->toBe(ShowStatus::Watching);

    $this->actingAs($user)->get(route('shows'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('watchNext', 1)
            ->where('watchNext.0.show_id', $show->id)
            ->where('watchNext.0.episode.id', $episodes->get(1)->id)
            ->where('watchLaterCount', 0)
        );
});

it('removes a show from every visible watch-list section after its final released episode', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeReleasedShow(1);
    $user->showTrackings()->create([
        'show_id' => $show->id,
        'status' => ShowStatus::Watching,
    ]);

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watched', $episodes->sole()), ['action' => 'increment'])
        ->assertOk();

    $this->actingAs($user)->get(route('shows'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('watchNext', 0)
            ->has('haventStarted', 0)
        );
});

it('orders equal watch timestamps deterministically by show id', function () {
    $user = User::factory()->create();
    [$firstShow, $firstEpisodes] = makeReleasedShow(2);
    [$secondShow, $secondEpisodes] = makeReleasedShow(2);
    $watchedAt = now()->subDay();

    foreach ([[$firstShow, $firstEpisodes], [$secondShow, $secondEpisodes]] as [$show, $episodes]) {
        $user->showTrackings()->create([
            'show_id' => $show->id,
            'status' => ShowStatus::Watching,
        ]);
        $user->episodeWatches()->create([
            'episode_id' => $episodes->first()->id,
            'watched' => true,
            'watch_count' => 1,
            'watched_date' => $watchedAt,
        ]);
    }

    $expectedOrder = collect([$firstShow->id, $secondShow->id])->sort()->values()->all();

    $this->actingAs($user)->get(route('shows'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('watchNext.0.show_id', $expectedOrder[0])
            ->where('watchNext.1.show_id', $expectedOrder[1])
        );
});

it('tags each row with status + progress for the left-swipe menu', function () {
    $user = User::factory()->create();

    // Watching, in progress → Watch Next.
    [$started, $startedEps] = makeReleasedShow(3);
    $user->showTrackings()->create(['show_id' => $started->id, 'status' => ShowStatus::Watching]);
    $user->episodeWatches()->create(['episode_id' => $startedEps[0]->id, 'watched' => true, 'watch_count' => 1]);

    // Watching, no progress → Haven't Started.
    [$fresh] = makeReleasedShow(2);
    $user->showTrackings()->create(['show_id' => $fresh->id, 'status' => ShowStatus::Watching]);

    $this->actingAs($user)->get(route('shows'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('watchNext.0.status', 'watching')
            ->where('watchNext.0.has_progress', true)
            ->where('haventStarted.0.status', 'watching')
            ->where('haventStarted.0.has_progress', false)
            // air_date is surfaced so the client can gate the right-swipe.
            ->where('watchNext.0.episode.air_date', $startedEps[1]->air_date->toDateString())
        );
});

it('keeps another member\'s progress out of my watch list', function () {
    $me = User::factory()->create();
    $them = User::factory()->create();
    [$show, $eps] = makeReleasedShow(3);
    // They track and progress it; I don't track it at all.
    $them->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);
    $them->episodeWatches()->create(['episode_id' => $eps[0]->id, 'watched' => true, 'watch_count' => 1]);

    $this->actingAs($me)->get(route('shows'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->has('watchNext', 0)->has('haventStarted', 0));
});

it('shows only released unwatched tracked movies in Watch Next', function () {
    $user = User::factory()->create();
    $seen = Movie::factory()->create(['release_date' => $user->localToday()->subDay()]);
    $unseen = Movie::factory()->create(['release_date' => $user->localToday()]);
    $future = Movie::factory()->create(['release_date' => $user->localToday()->addDay()]);
    $undated = Movie::factory()->create(['release_date' => null]);
    $user->movieTrackings()->create(['movie_id' => $seen->id, 'watched' => true, 'watch_count' => 2]);
    $user->movieTrackings()->create(['movie_id' => $unseen->id, 'watched' => false]);
    $user->movieTrackings()->create(['movie_id' => $future->id, 'watched' => false]);
    $user->movieTrackings()->create(['movie_id' => $undated->id, 'watched' => false]);

    $this->actingAs($user)->get(route('movies'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('movies')
            ->has('watchNext', 1)
            ->where('watchNext.0.id', $unseen->id)
            ->where('trackedCount', 4)
        );
});

/*
|--------------------------------------------------------------------------
| Part 2: Watched History pagination + left-swipe status actions
|--------------------------------------------------------------------------
*/

it('is not part of the initial Shows page payload', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->get(route('shows'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->missing('watchedHistory'));
});

it('paginates watched history newest-first, 15 at a time, via a cursor', function () {
    $user = User::factory()->create();
    [, $eps] = makeReleasedShow(20);

    // Episode n watched n days ago from the end: ep1 oldest, ep20 newest.
    $eps->each(fn (Episode $episode) => $user->episodeWatches()->create([
        'episode_id' => $episode->id,
        'watched' => true,
        'watch_count' => 1,
        'watched_date' => now()->subDays(21 - $episode->episode_number),
    ]));

    $first = $this->actingAs($user)->getJson(route('shows.watched-history'));
    $first->assertOk()
        ->assertJsonCount(15, 'rows')
        ->assertJsonPath('hasMore', true)
        ->assertJsonPath('rows.0.episode.episode_number', 20) // newest first
        ->assertJsonPath('rows.14.episode.episode_number', 6);

    $second = $this->actingAs($user)
        ->getJson(route('shows.watched-history', ['cursor' => $first->json('nextCursor')]));
    $second->assertOk()
        ->assertJsonCount(5, 'rows')
        ->assertJsonPath('hasMore', false)
        ->assertJsonPath('rows.0.episode.episode_number', 5)
        ->assertJsonPath('rows.4.episode.episode_number', 1);
});

it('keeps unwatched episodes and other members out of watched history', function () {
    $me = User::factory()->create();
    $them = User::factory()->create();
    [, $eps] = makeReleasedShow(3);

    $me->episodeWatches()->create(['episode_id' => $eps[0]->id, 'watched' => true, 'watch_count' => 1, 'watched_date' => now()]);
    // Unwatched for me, and watched by another member — neither should appear.
    $me->episodeWatches()->create(['episode_id' => $eps[1]->id, 'watched' => false]);
    $them->episodeWatches()->create(['episode_id' => $eps[2]->id, 'watched' => true, 'watch_count' => 1, 'watched_date' => now()]);

    $this->actingAs($me)->getJson(route('shows.watched-history'))
        ->assertOk()
        ->assertJsonCount(1, 'rows')
        ->assertJsonPath('rows.0.episode.id', $eps[0]->id);
});

it('returns an episode to watch next after it is marked not watched from history', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeReleasedShow(2);
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    $episodes->each(fn (Episode $episode) => $user->episodeWatches()->create([
        'episode_id' => $episode->id,
        'watched' => true,
        'watch_count' => 1,
        'watched_date' => now(),
    ]));

    $episodeToRewatch = $episodes->first();

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watched', $episodeToRewatch), ['action' => 'reset'])
        ->assertOk()
        ->assertJsonPath('watch.watched', false);

    $this->actingAs($user)->getJson(route('shows.watched-history'))
        ->assertOk()
        ->assertJsonCount(1, 'rows')
        ->assertJsonPath('rows.0.episode.id', $episodes->last()->id);

    $this->actingAs($user)->get(route('shows'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('watchNext', 1)
            ->where('watchNext.0.show_id', $show->id)
            ->where('watchNext.0.episode.id', $episodeToRewatch->id)
        );
});

it('moves a show to watch_later then stopped via setStatus', function () {
    $user = User::factory()->create();
    [$show] = makeReleasedShow(2);
    $tracking = $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    $this->actingAs($user)->patchJson(route('track.shows.status', $show), ['status' => 'watch_later'])
        ->assertOk()
        ->assertJsonPath('status', 'watch_later');
    expect($tracking->fresh()->status)->toBe(ShowStatus::WatchLater);

    $this->actingAs($user)->patchJson(route('track.shows.status', $show), ['status' => 'stopped'])
        ->assertOk();
    expect($tracking->fresh()->status)->toBe(ShowStatus::Stopped);
});

it('rejects a setStatus the swipe menu never offers', function () {
    $user = User::factory()->create();
    [$show] = makeReleasedShow(1);
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    $this->actingAs($user)->patchJson(route('track.shows.status', $show), ['status' => 'finished'])
        ->assertStatus(422);
});

it('removes tracking on removeFromList but preserves watch history', function () {
    $user = User::factory()->create();
    [$show, $eps] = makeReleasedShow(2);
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);
    $user->episodeWatches()->create(['episode_id' => $eps[0]->id, 'watched' => true, 'watch_count' => 1]);

    $this->actingAs($user)->deleteJson(route('track.shows.remove', $show))
        ->assertOk()
        ->assertJsonPath('tracked', false);

    expect($user->showTrackings()->where('show_id', $show->id)->exists())->toBeFalse();
    // Unlike destroy(), the episode-watch row survives — history is never discarded.
    expect(
        $user->episodeWatches()->where('episode_id', $eps[0]->id)->where('watched', true)->exists()
    )->toBeTrue();
});

it('scopes setStatus and removeFromList to the acting user', function () {
    $me = User::factory()->create();
    $them = User::factory()->create();
    [$show] = makeReleasedShow(1);
    $theirTracking = $them->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    // I don't track this show; neither call may touch their row.
    $this->actingAs($me)->patchJson(route('track.shows.status', $show), ['status' => 'stopped'])->assertOk();
    $this->actingAs($me)->deleteJson(route('track.shows.remove', $show))->assertOk();

    expect($theirTracking->fresh()->status)->toBe(ShowStatus::Watching);
    expect($them->showTrackings()->where('show_id', $show->id)->exists())->toBeTrue();
});
