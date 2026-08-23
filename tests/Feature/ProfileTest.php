<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Models\Episode;
use App\Models\Movie;
use App\Models\Show;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

function profileTrackShow(User $user, ShowStatus $status, array $attributes = []): Show
{
    $show = Show::factory()->create($attributes);
    $user->showTrackings()->create([
        'show_id' => $show->id,
        'status' => $status,
    ]);

    return $show;
}

function profileEpisode(Show $show, int $season, int $number, ?string $airDate, ?int $runtime = 45): Episode
{
    return Episode::factory()->create([
        'show_id' => $show->id,
        'season_number' => $season,
        'episode_number' => $number,
        'air_date' => $airDate,
        'runtime_minutes' => $runtime,
    ]);
}

function profileWatchEpisode(User $user, Episode $episode, int $count = 1, ?string $watchedDate = null): void
{
    $user->episodeWatches()->create([
        'episode_id' => $episode->id,
        'watched' => true,
        'watch_count' => $count,
        'watched_date' => $watchedDate ?? now(),
    ]);
}

it('requires authentication for the profile page and both library endpoints', function (string $routeName) {
    $this->get(route($routeName))->assertRedirect(route('login'));
})->with(['profile', 'profile.library.shows', 'profile.library.movies']);

it('returns the profile component with a purpose-built zero-state payload', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->get(route('profile'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('profile')
            ->where('user.name', $user->name)
            ->where('user.email', $user->email)
            ->where('stats.tv_minutes', 0)
            ->where('stats.episodes_watched', 0)
            ->where('stats.movie_minutes', 0)
            ->where('stats.movies_watched', 0)
            ->has('recentShows', 0)
            ->has('recentMovies', 0)
            ->missing('user.password')
        );
});

it('calculates rewatch-aware stats, treats null runtime as zero, includes specials, and stays private', function () {
    $me = User::factory()->create();
    $other = User::factory()->create();
    $show = Show::factory()->create();

    $regular = profileEpisode($show, 1, 1, '2026-07-01', 45);
    $nullRuntime = profileEpisode($show, 1, 2, '2026-07-02', null);
    $special = profileEpisode($show, 0, 1, '2026-07-03', 10);

    profileWatchEpisode($me, $regular, 3);
    profileWatchEpisode($me, $nullRuntime, 2);
    profileWatchEpisode($me, $special, 2);
    profileWatchEpisode($other, profileEpisode($show, 1, 3, '2026-07-03', 500), 8);

    $movie = Movie::factory()->create(['runtime_minutes' => 120]);
    $nullRuntimeMovie = Movie::factory()->create(['runtime_minutes' => null]);
    $otherMovie = Movie::factory()->create(['runtime_minutes' => 900]);
    $me->movieTrackings()->create([
        'movie_id' => $movie->id,
        'watched' => true,
        'watch_count' => 2,
        'watched_date' => now(),
    ]);
    $me->movieTrackings()->create([
        'movie_id' => $nullRuntimeMovie->id,
        'watched' => true,
        'watch_count' => 3,
        'watched_date' => now(),
    ]);
    $other->movieTrackings()->create([
        'movie_id' => $otherMovie->id,
        'watched' => true,
        'watch_count' => 9,
        'watched_date' => now(),
    ]);

    $this->actingAs($me)->get(route('profile'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('stats.episodes_watched', 7)
            ->where('stats.tv_minutes', 155)
            ->where('stats.movies_watched', 5)
            ->where('stats.movie_minutes', 240)
        );
});

it('orders recent shows by latest watch, includes each show once, then falls back to tracking order', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();

    $olderWatched = profileTrackShow($user, ShowStatus::Watching, ['title' => 'Older watched']);
    profileWatchEpisode($user, profileEpisode($olderWatched, 1, 1, '2026-01-01'), 1, '2026-07-10');
    profileWatchEpisode($user, profileEpisode($olderWatched, 1, 2, '2026-01-02'), 1, '2026-07-11');

    $newerWatched = profileTrackShow($user, ShowStatus::Watching, ['title' => 'Newer watched']);
    profileWatchEpisode($user, profileEpisode($newerWatched, 1, 1, '2026-01-01'), 1, '2026-07-12');

    $olderUnwatched = profileTrackShow($user, ShowStatus::WatchLater, ['title' => 'Older unwatched']);
    $newerUnwatched = profileTrackShow($user, ShowStatus::WatchLater, ['title' => 'Newer unwatched']);
    profileTrackShow($other, ShowStatus::Watching, ['title' => 'Private']);

    $this->actingAs($user)->get(route('profile'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('recentShows', 4)
            ->where('recentShows.0.id', $newerWatched->id)
            ->where('recentShows.1.id', $olderWatched->id)
            ->where('recentShows.2.id', $newerUnwatched->id)
            ->where('recentShows.3.id', $olderUnwatched->id)
        );
});

it('limits both recent shelves to twenty user-scoped items', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();

    foreach (range(1, 22) as $number) {
        profileTrackShow($user, ShowStatus::WatchLater, ['title' => "Show {$number}"]);
        $movie = Movie::factory()->create(['title' => "Movie {$number}"]);
        $user->movieTrackings()->create(['movie_id' => $movie->id, 'watched' => false]);
    }

    profileTrackShow($other, ShowStatus::Watching);
    $otherMovie = Movie::factory()->create();
    $other->movieTrackings()->create(['movie_id' => $otherMovie->id, 'watched' => true, 'watch_count' => 1]);

    $this->actingAs($user)->get(route('profile'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('recentShows', 20)
            ->has('recentMovies', 20)
        );
});

it('orders watched movies by watched date before unwatched tracking rows', function () {
    $user = User::factory()->create();
    $older = Movie::factory()->create(['title' => 'Older watched']);
    $newer = Movie::factory()->create(['title' => 'Newer watched']);
    $olderUnwatched = Movie::factory()->create(['title' => 'Older unwatched']);
    $newerUnwatched = Movie::factory()->create(['title' => 'Newer unwatched']);

    $user->movieTrackings()->create(['movie_id' => $older->id, 'watched' => true, 'watch_count' => 1, 'watched_date' => '2026-07-10']);
    $user->movieTrackings()->create(['movie_id' => $newer->id, 'watched' => true, 'watch_count' => 1, 'watched_date' => '2026-07-12']);
    $user->movieTrackings()->create(['movie_id' => $olderUnwatched->id, 'watched' => false]);
    $user->movieTrackings()->create(['movie_id' => $newerUnwatched->id, 'watched' => false]);

    $this->actingAs($user)->get(route('profile'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('recentMovies.0.id', $newer->id)
            ->where('recentMovies.1.id', $older->id)
            ->where('recentMovies.2.id', $newerUnwatched->id)
            ->where('recentMovies.3.id', $olderUnwatched->id)
        );
});

it('groups shows using aired regular episodes without mutating persisted statuses', function () {
    $this->travelTo('2026-07-13 12:00:00');
    $user = User::factory()->create(['timezone' => 'America/New_York']);
    $other = User::factory()->create();

    $watching = profileTrackShow($user, ShowStatus::Watching, ['title' => 'Watching']);
    $watchingAired = profileEpisode($watching, 1, 1, '2026-07-01');
    profileEpisode($watching, 1, 2, '2026-07-02');
    profileEpisode($watching, 1, 3, '2026-07-14');
    $watchingSpecial = profileEpisode($watching, 0, 1, '2026-07-01');
    profileWatchEpisode($user, $watchingAired);
    profileWatchEpisode($user, $watchingSpecial);

    profileTrackShow($user, ShowStatus::WatchLater, ['title' => 'Watch Later']);

    $upToDate = profileTrackShow($user, ShowStatus::Watching, ['title' => 'Up to Date']);
    profileWatchEpisode($user, profileEpisode($upToDate, 1, 1, '2026-07-01'));
    profileEpisode($upToDate, 1, 2, '2026-07-20');

    profileTrackShow($user, ShowStatus::Watching, ['title' => 'No aired episodes']);

    $finished = profileTrackShow($user, ShowStatus::Finished, ['title' => 'Finished', 'ended' => true]);
    profileWatchEpisode($user, profileEpisode($finished, 1, 1, '2026-07-01'));

    $stopped = profileTrackShow($user, ShowStatus::Stopped, ['title' => 'Stopped']);
    profileEpisode($stopped, 1, 1, '2026-07-01');

    profileTrackShow($other, ShowStatus::Watching, ['title' => 'Other user']);

    $response = $this->actingAs($user)->getJson(route('profile.library.shows'));
    $response->assertOk()->assertJsonStructure([
        'groups' => [['key', 'shows' => [['id', 'title', 'poster_url', 'progress' => ['watched', 'aired', 'percentage', 'visible']]]]],
    ]);

    $groups = collect($response->json('groups'))->keyBy('key');

    expect($groups->keys()->all())->toBe(['watching', 'watch_later', 'up_to_date', 'finished', 'stopped']);
    expect($groups['watching']['shows'])->toHaveCount(1);
    expect($groups['watching']['shows'][0]['id'])->toBe($watching->id);
    expect($groups['watching']['shows'][0]['progress'])->toMatchArray([
        'watched' => 1,
        'aired' => 2,
        'percentage' => 50,
        'visible' => true,
    ]);
    expect($groups['watch_later']['shows'][0]['progress'])->toMatchArray([
        'watched' => 0,
        'aired' => 0,
        'percentage' => 0,
        'visible' => false,
    ]);
    expect(collect($groups['up_to_date']['shows'])->pluck('title')->all())
        ->toContain('Up to Date', 'No aired episodes');
    expect($groups['finished']['shows'][0]['id'])->toBe($finished->id);
    expect($groups['stopped']['shows'][0]['id'])->toBe($stopped->id);
    expect($response->json())->not->toContain('Other user');
    expect($user->showTrackings()->where('show_id', $upToDate->id)->value('status'))->toBe(ShowStatus::Watching);
});

it('orders each show library group by recent watch and places never-watched tracking last', function () {
    $this->travelTo('2026-07-13 12:00:00');
    $user = User::factory()->create();

    $older = profileTrackShow($user, ShowStatus::Watching, ['title' => 'Older']);
    profileWatchEpisode($user, profileEpisode($older, 1, 1, '2026-07-01'), 1, '2026-07-10');
    profileEpisode($older, 1, 2, '2026-07-02');

    $newer = profileTrackShow($user, ShowStatus::Watching, ['title' => 'Newer']);
    profileWatchEpisode($user, profileEpisode($newer, 1, 1, '2026-07-01'), 1, '2026-07-12');
    profileEpisode($newer, 1, 2, '2026-07-02');

    $neverWatched = profileTrackShow($user, ShowStatus::Watching, ['title' => 'Never watched']);
    profileEpisode($neverWatched, 1, 1, '2026-07-01');

    $response = $this->actingAs($user)->getJson(route('profile.library.shows'))->assertOk();
    $watching = collect($response->json('groups'))->firstWhere('key', 'watching');

    expect(array_column($watching['shows'], 'id'))->toBe([
        $newer->id,
        $older->id,
        $neverWatched->id,
    ]);
});

it('groups and orders movies while excluding another users library', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();
    $older = Movie::factory()->create(['title' => 'Older watched']);
    $newer = Movie::factory()->create(['title' => 'Newer watched']);
    $olderUnwatched = Movie::factory()->create(['title' => 'Older unwatched']);
    $newerUnwatched = Movie::factory()->create(['title' => 'Newer unwatched']);
    $private = Movie::factory()->create(['title' => 'Private movie']);

    $user->movieTrackings()->create(['movie_id' => $older->id, 'watched' => true, 'watch_count' => 1, 'watched_date' => '2026-07-10']);
    $user->movieTrackings()->create(['movie_id' => $newer->id, 'watched' => true, 'watch_count' => 2, 'watched_date' => '2026-07-12']);
    $user->movieTrackings()->create(['movie_id' => $olderUnwatched->id, 'watched' => false]);
    $user->movieTrackings()->create(['movie_id' => $newerUnwatched->id, 'watched' => false]);
    $other->movieTrackings()->create(['movie_id' => $private->id, 'watched' => true, 'watch_count' => 1]);

    $response = $this->actingAs($user)->getJson(route('profile.library.movies'));
    $response->assertOk()->assertJsonStructure([
        'groups' => [['key', 'movies' => [['id', 'title', 'poster_url']]]],
    ]);

    $groups = collect($response->json('groups'))->keyBy('key');

    expect($groups->keys()->all())->toBe(['watched', 'not_watched']);
    expect(array_column($groups['watched']['movies'], 'id'))->toBe([$newer->id, $older->id]);
    expect(array_column($groups['not_watched']['movies'], 'id'))->toBe([$newerUnwatched->id, $olderUnwatched->id]);
    expect($response->json())->not->toContain('Private movie');
});

it('returns stable empty library shapes for an authenticated user', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->getJson(route('profile.library.shows'))
        ->assertOk()
        ->assertExactJson(['groups' => []]);

    $this->actingAs($user)->getJson(route('profile.library.movies'))
        ->assertOk()
        ->assertExactJson(['groups' => []]);
});
