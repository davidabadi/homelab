<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Models\Episode;
use App\Models\Show;
use App\Models\User;
use App\Models\UserEpisodeWatch;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Build a show with two seasons of episodes (S1: 3 eps, S2: 2 eps) for the
 * per-user episode toggle tests. Returns [$show, $season1Episodes, $season2Episodes].
 *
 * @return array{0: Show, 1: Collection<int, Episode>, 2: Collection<int, Episode>}
 */
function makeShowWithEpisodes(): array
{
    $show = Show::factory()->create();

    $season1 = Episode::factory()->count(3)
        ->sequence(['episode_number' => 1], ['episode_number' => 2], ['episode_number' => 3])
        ->create(['show_id' => $show->id, 'season_number' => 1]);

    $season2 = Episode::factory()->count(2)
        ->sequence(['episode_number' => 1], ['episode_number' => 2])
        ->create(['show_id' => $show->id, 'season_number' => 2]);

    return [$show, $season1, $season2];
}

it('redirects guests away from toggling an episode', function () {
    $episode = Episode::factory()->create();

    $this->patch(route('track.episodes.watched', $episode))
        ->assertRedirect(route('login'));
});

/*
|--------------------------------------------------------------------------
| Single-episode toggle (scope item 1)
|--------------------------------------------------------------------------
*/

it('marks an episode watched (count 0 → 1), stamping a watched_date, then resets it off', function () {
    $user = User::factory()->create();
    [$show, $season1] = makeShowWithEpisodes();
    $episode = $season1->first();

    // Default action is increment: creates the watch row at count 1, watched.
    $this->actingAs($user)
        ->patchJson(route('track.episodes.watched', $episode))
        ->assertOk()
        ->assertJsonPath('watch.watched', true)
        ->assertJsonPath('watch.watch_count', 1)
        ->assertJsonPath('watch.episode_id', $episode->id);

    $watch = UserEpisodeWatch::where(['user_id' => $user->id, 'episode_id' => $episode->id])->firstOrFail();
    expect($watch->watched)->toBeTrue()
        ->and($watch->watch_count)->toBe(1)
        ->and($watch->watched_date)->not->toBeNull();

    // Reset: back to not watched, count 0, watched_date cleared.
    $this->actingAs($user)
        ->patchJson(route('track.episodes.watched', $episode), ['action' => 'reset'])
        ->assertOk()
        ->assertJsonPath('watch.watched', false)
        ->assertJsonPath('watch.watch_count', 0)
        ->assertJsonPath('watch.watched_date', null);

    expect($watch->fresh()->watched)->toBeFalse()
        ->and($watch->fresh()->watch_count)->toBe(0)
        ->and($watch->fresh()->watched_date)->toBeNull();
});

it('increments the watch count on repeated "watched again" (rewatches)', function () {
    $user = User::factory()->create();
    [$show, $season1] = makeShowWithEpisodes();
    $episode = $season1->first();

    $this->actingAs($user)->patchJson(route('track.episodes.watched', $episode), ['action' => 'increment'])
        ->assertOk()->assertJsonPath('watch.watch_count', 1);
    $this->actingAs($user)->patchJson(route('track.episodes.watched', $episode), ['action' => 'increment'])
        ->assertOk()->assertJsonPath('watch.watch_count', 2);
    $this->actingAs($user)->patchJson(route('track.episodes.watched', $episode), ['action' => 'increment'])
        ->assertOk()->assertJsonPath('watch.watch_count', 3)->assertJsonPath('watch.watched', true);
});

it('collapses a multi-watch count back to one with set_once', function () {
    $user = User::factory()->create();
    [$show, $season1] = makeShowWithEpisodes();
    $episode = $season1->first();
    $user->episodeWatches()->create(['episode_id' => $episode->id, 'watched' => true, 'watch_count' => 4]);

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watched', $episode), ['action' => 'set_once'])
        ->assertOk()
        ->assertJsonPath('watch.watch_count', 1)
        ->assertJsonPath('watch.watched', true);
});

it('rejects an unknown watch action', function () {
    $user = User::factory()->create();
    [$show, $season1] = makeShowWithEpisodes();

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watched', $season1->first()), ['action' => 'nonsense'])
        ->assertStatus(422)
        ->assertJsonValidationErrorFor('action');
});

it('auto-tracks an untracked show as "watching" when an episode is first toggled', function () {
    $user = User::factory()->create();
    [$show, $season1] = makeShowWithEpisodes();

    // No tracking row exists before the toggle.
    expect($user->showTrackings()->count())->toBe(0);

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watched', $season1->first()))
        ->assertOk();

    $this->assertDatabaseHas('user_show_tracking', [
        'user_id' => $user->id,
        'show_id' => $show->id,
        'status' => ShowStatus::Watching->value,
    ]);
});

it('leaves an already-tracked show\'s status untouched when toggling an episode', function () {
    $user = User::factory()->create();
    [$show, $season1] = makeShowWithEpisodes();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Finished]);

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watched', $season1->first()))
        ->assertOk();

    // Auto-track must not clobber an existing status.
    expect($user->showTrackings()->where('show_id', $show->id)->first()->status)
        ->toBe(ShowStatus::Finished);
});

/*
|--------------------------------------------------------------------------
| Season bulk-toggle (scope item 2)
|--------------------------------------------------------------------------
*/

it('bulk-marks every episode in a season watched in one batch, leaving other seasons alone', function () {
    $user = User::factory()->create();
    [$show, $season1, $season2] = makeShowWithEpisodes();

    DB::enableQueryLog();

    $this->actingAs($user)
        ->patchJson(route('track.shows.seasons.watched', ['show' => $show->id, 'season' => 1]), ['watched' => true])
        ->assertOk()
        ->assertJsonPath('episodes_affected', 3)
        ->assertJsonPath('watched', true);

    // Real batch: exactly one write statement touches user_episode_watches, not
    // N (a single read to skip already-watched rows is fine — what matters is the
    // write is one upsert, never a per-episode loop).
    $watchWrites = collect(DB::getQueryLog())
        ->filter(fn ($q) => str_contains($q['query'], 'insert into "user_episode_watches"'))
        ->count();
    expect($watchWrites)->toBe(1);
    DB::disableQueryLog();

    // Every season-1 episode watched...
    foreach ($season1 as $episode) {
        $this->assertDatabaseHas('user_episode_watches', [
            'user_id' => $user->id,
            'episode_id' => $episode->id,
            'watched' => true,
        ]);
    }
    // ...and season 2 completely untouched.
    foreach ($season2 as $episode) {
        $this->assertDatabaseMissing('user_episode_watches', [
            'user_id' => $user->id,
            'episode_id' => $episode->id,
        ]);
    }
});

it('preserves an existing rewatch count when bulk-marking a season watched', function () {
    $user = User::factory()->create();
    [$show, $season1] = makeShowWithEpisodes();
    $rewatched = $season1->first();
    // This episode has already been watched three times.
    $user->episodeWatches()->create(['episode_id' => $rewatched->id, 'watched' => true, 'watch_count' => 3]);

    $this->actingAs($user)
        ->patchJson(route('track.shows.seasons.watched', ['show' => $show->id, 'season' => 1]), ['watched' => true])
        ->assertOk();

    // The rewatch count survives; the others are freshly at a single watch.
    expect($user->episodeWatches()->where('episode_id', $rewatched->id)->sole()->watch_count)->toBe(3);
    $season1->reject(fn ($e) => $e->id === $rewatched->id)->each(function ($episode) use ($user) {
        expect($user->episodeWatches()->where('episode_id', $episode->id)->sole()->watch_count)->toBe(1);
    });
});

it('bulk-marks only episodes that have aired in the user timezone', function () {
    $user = User::factory()->create(['timezone' => 'America/New_York']);
    $show = Show::factory()->create();
    $aired = Episode::factory()->create([
        'show_id' => $show->id,
        'season_number' => 1,
        'episode_number' => 1,
        'air_date' => $user->localToday(),
    ]);
    $future = Episode::factory()->create([
        'show_id' => $show->id,
        'season_number' => 1,
        'episode_number' => 2,
        'air_date' => $user->localToday()->addWeek(),
    ]);
    $undated = Episode::factory()->create([
        'show_id' => $show->id,
        'season_number' => 1,
        'episode_number' => 3,
        'air_date' => null,
    ]);

    $this->actingAs($user)
        ->patchJson(route('track.shows.seasons.watched', ['show' => $show->id, 'season' => 1]), ['watched' => true])
        ->assertOk()
        ->assertJsonPath('episodes_affected', 1);

    $this->assertDatabaseHas('user_episode_watches', [
        'user_id' => $user->id,
        'episode_id' => $aired->id,
        'watched' => true,
    ]);
    $this->assertDatabaseMissing('user_episode_watches', ['user_id' => $user->id, 'episode_id' => $future->id]);
    $this->assertDatabaseMissing('user_episode_watches', ['user_id' => $user->id, 'episode_id' => $undated->id]);
});

it('bulk-unmarks a whole season watched=false, clearing watched_date', function () {
    $user = User::factory()->create();
    [$show, $season1] = makeShowWithEpisodes();

    // First mark the season watched, then clear it.
    $this->actingAs($user)
        ->patchJson(route('track.shows.seasons.watched', ['show' => $show->id, 'season' => 1]), ['watched' => true])
        ->assertOk();

    $this->actingAs($user)
        ->patchJson(route('track.shows.seasons.watched', ['show' => $show->id, 'season' => 1]), ['watched' => false])
        ->assertOk()
        ->assertJsonPath('episodes_affected', 3)
        ->assertJsonPath('watched', false);

    foreach ($season1 as $episode) {
        $this->assertDatabaseHas('user_episode_watches', [
            'user_id' => $user->id,
            'episode_id' => $episode->id,
            'watched' => false,
            'watched_date' => null,
        ]);
    }
});

it('auto-tracks the show as "watching" on a season bulk-toggle', function () {
    $user = User::factory()->create();
    [$show] = makeShowWithEpisodes();

    $this->actingAs($user)
        ->patchJson(route('track.shows.seasons.watched', ['show' => $show->id, 'season' => 1]), ['watched' => true])
        ->assertOk();

    $this->assertDatabaseHas('user_show_tracking', [
        'user_id' => $user->id,
        'show_id' => $show->id,
        'status' => ShowStatus::Watching->value,
    ]);
});

it('requires an explicit watched flag on a season bulk-toggle', function () {
    $user = User::factory()->create();
    [$show] = makeShowWithEpisodes();

    $this->actingAs($user)
        ->patchJson(route('track.shows.seasons.watched', ['show' => $show->id, 'season' => 1]), [])
        ->assertStatus(422)
        ->assertJsonValidationErrorFor('watched');
});

/*
|--------------------------------------------------------------------------
| Read back watched status (scope item 4)
|--------------------------------------------------------------------------
*/

it('reads back each episode with this user\'s accurate watched status', function () {
    $user = User::factory()->create();
    [$show, $season1] = makeShowWithEpisodes();
    $watchedEpisode = $season1->firstWhere('episode_number', 2);

    $this->actingAs($user)->patchJson(route('track.episodes.watched', $watchedEpisode))->assertOk();

    $response = $this->actingAs($user)->getJson(route('track.shows.episodes', $show))->assertOk();

    // All five episodes come back, ordered by season then episode number.
    $response->assertJsonCount(5, 'episodes')
        ->assertJsonPath('episodes.0.season_number', 1)
        ->assertJsonPath('episodes.0.episode_number', 1);

    $episodes = collect($response->json('episodes'));
    $watchedRow = $episodes->firstWhere('episode_id', $watchedEpisode->id);
    expect($watchedRow['watched'])->toBeTrue()
        ->and($watchedRow['watched_date'])->not->toBeNull();

    // Every other episode reads back unwatched with a null date.
    $episodes->reject(fn ($e) => $e['episode_id'] === $watchedEpisode->id)
        ->each(function ($e) {
            expect($e['watched'])->toBeFalse()
                ->and($e['watched_date'])->toBeNull();
        });
});

/*
|--------------------------------------------------------------------------
| Per-user isolation (scope item 5)
|--------------------------------------------------------------------------
*/

it('keeps each user\'s episode watched state isolated on toggle', function () {
    $owner = User::factory()->create();
    $intruder = User::factory()->create();
    [$show, $season1] = makeShowWithEpisodes();
    $episode = $season1->first();

    // Owner marks it watched.
    $this->actingAs($owner)->patchJson(route('track.episodes.watched', $episode))->assertOk();

    // Intruder toggling the same shared episode only creates/affects their own
    // row — the owner's stays watched.
    $this->actingAs($intruder)
        ->patchJson(route('track.episodes.watched', $episode))
        ->assertOk()
        ->assertJsonPath('watch.watched', true);

    expect(UserEpisodeWatch::where('episode_id', $episode->id)->count())->toBe(2);
    expect(UserEpisodeWatch::where(['user_id' => $owner->id, 'episode_id' => $episode->id])->first()->watched)->toBeTrue();
});

it('does not leak another user\'s watched status when reading a show\'s episodes', function () {
    $owner = User::factory()->create();
    $reader = User::factory()->create();
    [$show, $season1] = makeShowWithEpisodes();

    // Owner marks the whole first season watched.
    $this->actingAs($owner)
        ->patchJson(route('track.shows.seasons.watched', ['show' => $show->id, 'season' => 1]), ['watched' => true])
        ->assertOk();

    // A different user reading the same show sees everything unwatched.
    $episodes = collect(
        $this->actingAs($reader)->getJson(route('track.shows.episodes', $show))->assertOk()->json('episodes')
    );

    expect($episodes)->toHaveCount(5);
    $episodes->each(fn ($e) => expect($e['watched'])->toBeFalse());
});
