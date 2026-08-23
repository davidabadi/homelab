<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Models\Episode;
use App\Models\MediaExternalId;
use App\Models\Show;
use App\Models\User;
use App\Services\Library\MediaLibraryService;

/**
 * Automatic status transitions (no manual dropdown): Watch Later / Stopped
 * promote to Watching on watch activity, and a fully-watched show that TMDB
 * reports as concluded auto-finishes — at toggle time and via the nightly sync.
 */
function makeShowWithOneSeason(bool $ended = false, int $episodes = 2): array
{
    $factory = Show::factory();
    $show = ($ended ? $factory->ended() : $factory)->create();

    $list = Episode::factory()->count($episodes)
        ->sequence(fn ($sequence) => ['episode_number' => $sequence->index + 1])
        ->create(['show_id' => $show->id, 'season_number' => 1]);

    return [$show, $list];
}

it('promotes a watch-later show to watching when an episode is marked watched', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeShowWithOneSeason();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::WatchLater]);

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watched', $episodes->first()))
        ->assertOk();

    expect($user->showTrackings()->sole()->status)->toBe(ShowStatus::Watching);
});

it('promotes a stopped show back to watching when an episode is marked watched', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeShowWithOneSeason();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Stopped]);

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watched', $episodes->first()))
        ->assertOk();

    expect($user->showTrackings()->sole()->status)->toBe(ShowStatus::Watching);
});

it('does not promote on unwatching an episode', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeShowWithOneSeason();

    // Watch (auto-tracks as watching), move to stopped, then unwatch (reset).
    $this->actingAs($user)->patchJson(route('track.episodes.watched', $episodes->first()))->assertOk();
    $user->showTrackings()->sole()->update(['status' => ShowStatus::Stopped]);

    $this->actingAs($user)
        ->patchJson(route('track.episodes.watched', $episodes->first()), ['action' => 'reset'])
        ->assertOk()
        ->assertJsonPath('watch.watched', false);

    expect($user->showTrackings()->sole()->status)->toBe(ShowStatus::Stopped);
});

it('finishes an ended show once the last episode is watched', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeShowWithOneSeason(ended: true);

    $this->actingAs($user)->patchJson(route('track.episodes.watched', $episodes->first()))->assertOk();
    expect($user->showTrackings()->sole()->status)->toBe(ShowStatus::Watching);

    $this->actingAs($user)->patchJson(route('track.episodes.watched', $episodes->last()))->assertOk();
    expect($user->showTrackings()->sole()->status)->toBe(ShowStatus::Finished);
});

it('finishes an ended show via a season bulk-toggle', function () {
    $user = User::factory()->create();
    [$show] = makeShowWithOneSeason(ended: true);

    $this->actingAs($user)
        ->patchJson(route('track.shows.seasons.watched', ['show' => $show->id, 'season' => 1]), ['watched' => true])
        ->assertOk();

    expect($user->showTrackings()->sole()->status)->toBe(ShowStatus::Finished);
});

it('does not finish a still-running show even when everything is watched', function () {
    $user = User::factory()->create();
    [$show] = makeShowWithOneSeason(ended: false);

    $this->actingAs($user)
        ->patchJson(route('track.shows.seasons.watched', ['show' => $show->id, 'season' => 1]), ['watched' => true])
        ->assertOk();

    expect($user->showTrackings()->sole()->status)->toBe(ShowStatus::Watching);
});

it('finishes an ended show even with unwatched specials — season 0 is not part of the show', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeShowWithOneSeason(ended: true);

    // An unwatched special must not block Finished.
    Episode::factory()->create(['show_id' => $show->id, 'season_number' => 0, 'episode_number' => 1]);

    $this->actingAs($user)
        ->patchJson(route('track.shows.seasons.watched', ['show' => $show->id, 'season' => 1]), ['watched' => true])
        ->assertOk();

    expect($user->showTrackings()->sole()->status)->toBe(ShowStatus::Finished);
});

it('does not finish an ended show while episodes remain unwatched', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeShowWithOneSeason(ended: true, episodes: 3);

    $this->actingAs($user)->patchJson(route('track.episodes.watched', $episodes->first()))->assertOk();

    expect($user->showTrackings()->sole()->status)->toBe(ShowStatus::Watching);
});

/*
|--------------------------------------------------------------------------
| Ended flag from TMDB + nightly-sync finishing
|--------------------------------------------------------------------------
*/

it('stores the concluded flag from TMDB when a show is first created', function () {
    fakeTmdb('Ended');
    $user = User::factory()->create();

    $this->actingAs($user)->postJson(route('track.shows.store'), ['tmdb_id' => 1399])->assertCreated();

    expect(Show::sole()->ended)->toBeTrue();
});

/**
 * A local show wired to TMDB id 1399 whose episodes line up with the fakeTmdb()
 * payload (S1E1, S1E2, S2E1), so refreshShow() updates them in place instead of
 * creating parallel rows.
 *
 * @return array{0: Show, 1: list<Episode>}
 */
function makeShowLinkedToTmdb(bool $ended = false): array
{
    $factory = Show::factory();
    $show = ($ended ? $factory->ended() : $factory)->create();

    MediaExternalId::create([
        'media_type' => 'show', 'media_id' => $show->id, 'provider' => 'tmdb', 'external_id' => '1399',
    ]);

    $episodes = [
        Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1]),
        Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 2]),
        Episode::factory()->create(['show_id' => $show->id, 'season_number' => 2, 'episode_number' => 1]),
    ];

    return [$show, $episodes];
}

it('finishes fully-watched trackings when the nightly sync learns the show has ended', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeShowLinkedToTmdb();

    // The show is still running, the user watches everything → stays Watching.
    foreach ($episodes as $episode) {
        $this->actingAs($user)->patchJson(route('track.episodes.watched', $episode))->assertOk();
    }
    expect($user->showTrackings()->sole()->status)->toBe(ShowStatus::Watching);

    // TMDB now reports the show as Ended; the nightly refresh both updates the
    // flag and finishes the completed tracking.
    fakeTmdb('Ended');
    app(MediaLibraryService::class)->refreshShow($show);

    expect($show->refresh()->ended)->toBeTrue();
    expect($user->showTrackings()->sole()->status)->toBe(ShowStatus::Finished);
});

it('leaves incomplete trackings alone when the nightly sync learns the show has ended', function () {
    $user = User::factory()->create();
    [$show, $episodes] = makeShowLinkedToTmdb();

    // Only one of the three episodes watched.
    $this->actingAs($user)->patchJson(route('track.episodes.watched', $episodes[0]))->assertOk();

    fakeTmdb('Ended');
    app(MediaLibraryService::class)->refreshShow($show);

    expect($show->refresh()->ended)->toBeTrue();
    expect($user->showTrackings()->sole()->status)->toBe(ShowStatus::Watching);
});

it('reopens the concluded flag when a show is revived', function () {
    [$show] = makeShowLinkedToTmdb(ended: true);

    // A new season is announced: TMDB flips back to Returning Series.
    fakeTmdb('Returning Series');
    app(MediaLibraryService::class)->refreshShow($show);

    expect($show->refresh()->ended)->toBeFalse();
});
