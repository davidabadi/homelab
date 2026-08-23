<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Models\Episode;
use App\Models\Movie;
use App\Models\Show;
use App\Models\User;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;

it('redirects guests away from the upcoming screens', function () {
    $this->get(route('shows.upcoming'))->assertRedirect(route('login'));
    $this->get(route('movies.upcoming'))->assertRedirect(route('login'));
    $this->get(route('shows.upcoming.backlog'))->assertRedirect(route('login'));
});

/*
|--------------------------------------------------------------------------
| Shows › Upcoming (build order item 10)
|--------------------------------------------------------------------------
*/

it('renders only future episodes from shows this user tracks, soonest first', function () {
    $user = User::factory()->create();
    $show = Show::factory()->create();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1, 'air_date' => today()->subDay(),
    ]);
    $airsToday = Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 2, 'air_date' => today(),
    ]);
    $soon = Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 3, 'air_date' => today()->addWeek(),
    ]);
    $later = Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 2, 'episode_number' => 1, 'air_date' => today()->addMonth(),
    ]);

    // Today counts as upcoming; yesterday does not. Ordered by air_date asc.
    $this->actingAs($user)->get(route('shows.upcoming'))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('shows/upcoming')
            ->where('today', today()->toDateString())
            ->has('episodes', 3)
            ->where('episodes.0.id', $airsToday->id)
            ->where('episodes.1.id', $soon->id)
            ->where('episodes.2.id', $later->id)
            ->where('episodes.0.show_title', $show->title)
            ->where('episodes.0.air_date', today()->toDateString())
            ->missing('episodes.3')
        );
});

it('carries this user\'s watched flag on upcoming episodes', function () {
    $user = User::factory()->create();
    $show = Show::factory()->create();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    // Someone can legitimately have watched a not-yet-aired episode (early
    // streaming release) — the flag must reflect that, per user.
    $seenEarly = Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1, 'air_date' => today()->addDay(),
    ]);
    $unseen = Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 2, 'air_date' => today()->addDay(),
    ]);
    $user->episodeWatches()->create(['episode_id' => $seenEarly->id, 'watched' => true, 'watched_date' => now()]);

    // Another member's watch of the "unseen" episode must not bleed through.
    $other = User::factory()->create();
    $other->episodeWatches()->create(['episode_id' => $unseen->id, 'watched' => true, 'watched_date' => now()]);

    $this->actingAs($user)->get(route('shows.upcoming'))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('shows/upcoming')
            ->has('episodes', 2)
            ->where('episodes.0.watch_count', 1)
            ->where('episodes.1.watch_count', 0)
        );
});

it('excludes specials (season 0) from the upcoming feed', function () {
    $user = User::factory()->create();
    $show = Show::factory()->create();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 0, 'episode_number' => 1, 'air_date' => today()->addWeek(),
    ]);
    $regular = Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1, 'air_date' => today()->addWeek(),
    ]);

    $this->actingAs($user)->get(route('shows.upcoming'))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('shows/upcoming')
            ->has('episodes', 1)
            ->where('episodes.0.id', $regular->id)
        );
});

it('excludes episodes from shows the user does not track', function () {
    $user = User::factory()->create();
    $tracked = Show::factory()->create();
    $user->showTrackings()->create(['show_id' => $tracked->id, 'status' => ShowStatus::Watching]);

    $untracked = Show::factory()->create();
    Episode::factory()->create([
        'show_id' => $untracked->id, 'season_number' => 1, 'episode_number' => 1, 'air_date' => today()->addWeek(),
    ]);
    $mine = Episode::factory()->create([
        'show_id' => $tracked->id, 'season_number' => 1, 'episode_number' => 1, 'air_date' => today()->addWeek(),
    ]);

    $this->actingAs($user)->get(route('shows.upcoming'))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('shows/upcoming')
            ->has('episodes', 1)
            ->where('episodes.0.id', $mine->id)
        );
});

it('only includes episodes from shows marked as watching', function () {
    $user = User::factory()->create();
    $watchingShow = Show::factory()->create();
    $watchLaterShow = Show::factory()->create();
    $finishedShow = Show::factory()->create();

    $user->showTrackings()->create(['show_id' => $watchingShow->id, 'status' => ShowStatus::Watching]);
    $user->showTrackings()->create(['show_id' => $watchLaterShow->id, 'status' => ShowStatus::WatchLater]);
    $user->showTrackings()->create(['show_id' => $finishedShow->id, 'status' => ShowStatus::Finished]);

    $watchingFuture = Episode::factory()->create([
        'show_id' => $watchingShow->id,
        'episode_number' => 1,
        'air_date' => today()->addWeek(),
    ]);
    $watchingBacklog = Episode::factory()->create([
        'show_id' => $watchingShow->id,
        'episode_number' => 2,
        'air_date' => today()->subWeek(),
    ]);

    foreach ([$watchLaterShow, $finishedShow] as $show) {
        Episode::factory()->create([
            'show_id' => $show->id,
            'episode_number' => 1,
            'air_date' => today()->addWeek(),
        ]);
        Episode::factory()->create([
            'show_id' => $show->id,
            'episode_number' => 2,
            'air_date' => today()->subWeek(),
        ]);
    }

    $this->actingAs($user)->get(route('shows.upcoming'))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->has('episodes', 1)
            ->where('episodes.0.id', $watchingFuture->id)
        );

    $this->actingAs($user)->getJson(route('shows.upcoming.backlog'))
        ->assertOk()
        ->assertJsonCount(1, 'rows')
        ->assertJsonPath('rows.0.id', $watchingBacklog->id);
});

it('isolates upcoming episodes per user — one member never sees another\'s tracked show', function () {
    $owner = User::factory()->create();
    $intruder = User::factory()->create();

    $ownersShow = Show::factory()->create();
    $owner->showTrackings()->create(['show_id' => $ownersShow->id, 'status' => ShowStatus::Watching]);
    Episode::factory()->create([
        'show_id' => $ownersShow->id, 'season_number' => 1, 'episode_number' => 1, 'air_date' => today()->addWeek(),
    ]);

    // The intruder tracks nothing → an empty feed even though the episode exists.
    $this->actingAs($intruder)->get(route('shows.upcoming'))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('shows/upcoming')
            ->has('episodes', 0)
        );

    // The owner sees their own.
    $this->actingAs($owner)->get(route('shows.upcoming'))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('shows/upcoming')
            ->has('episodes', 1)
        );
});

it('groups upcoming dates by the user\'s timezone, not the UTC storage clock', function () {
    // 8:30pm EDT on Sat 7/11 — already past midnight UTC (Sun 7/12), so a naive
    // UTC "today" would roll the calendar forward and read Sunday's episode as
    // airing "today". This user lives in America/New_York.
    Carbon::setTestNow(Carbon::parse('2026-07-12 00:30:00', 'UTC'));

    $user = User::factory()->create(['timezone' => 'America/New_York']);
    $show = Show::factory()->create();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    $airsSunday = Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 3, 'episode_number' => 4, 'air_date' => '2026-07-12',
    ]);
    // Aired Friday (household time) — already in the past, excluded.
    Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 3, 'episode_number' => 3, 'air_date' => '2026-07-10',
    ]);

    $this->actingAs($user)->get(route('shows.upcoming'))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('shows/upcoming')
            // The household day is still Saturday 7/11, so Sunday's episode is
            // "Tomorrow" — the client derives that from these two props.
            ->where('today', '2026-07-11')
            ->has('episodes', 1)
            ->where('episodes.0.id', $airsSunday->id)
            ->where('episodes.0.air_date', '2026-07-12')
        );

    Carbon::setTestNow();
});

/*
|--------------------------------------------------------------------------
| Shows › Upcoming backlog (aired-but-unwatched, spec Part 3)
|--------------------------------------------------------------------------
*/

it('returns aired-but-unwatched episodes for tracked shows, most-recently-aired first', function () {
    $user = User::factory()->create();
    $show = Show::factory()->create();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    $oldest = Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1, 'air_date' => today()->subWeek(),
    ]);
    $newest = Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 2, 'air_date' => today()->subDay(),
    ]);

    $this->actingAs($user)->getJson(route('shows.upcoming.backlog'))
        ->assertOk()
        ->assertJsonPath('hasMore', false)
        ->assertJsonPath('nextCursor', null)
        ->assertJsonCount(2, 'rows')
        // Most-recently-aired first (nearest the future feed / today boundary).
        ->assertJsonPath('rows.0.id', $newest->id)
        ->assertJsonPath('rows.0.watch_count', 0)
        ->assertJsonPath('rows.0.show_title', $show->title)
        ->assertJsonPath('rows.1.id', $oldest->id);
});

it('excludes episodes airing today or later from the backlog — no overlap with the future feed', function () {
    $user = User::factory()->create();
    $show = Show::factory()->create();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    $aired = Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1, 'air_date' => today()->subDay(),
    ]);
    // Today belongs to the future feed (air_date >= today), never the backlog.
    Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 2, 'air_date' => today(),
    ]);
    Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 3, 'air_date' => today()->addWeek(),
    ]);

    $this->actingAs($user)->getJson(route('shows.upcoming.backlog'))
        ->assertOk()
        ->assertJsonCount(1, 'rows')
        ->assertJsonPath('rows.0.id', $aired->id);
});

it('excludes already-watched episodes from the backlog', function () {
    $user = User::factory()->create();
    $show = Show::factory()->create();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    $watched = Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1, 'air_date' => today()->subWeek(),
    ]);
    $unwatched = Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 1, 'episode_number' => 2, 'air_date' => today()->subDay(),
    ]);
    $user->episodeWatches()->create(['episode_id' => $watched->id, 'watched' => true, 'watched_date' => now()]);

    // Another member's watch of the unwatched episode must not hide it from this user.
    $other = User::factory()->create();
    $other->episodeWatches()->create(['episode_id' => $unwatched->id, 'watched' => true, 'watched_date' => now()]);

    $this->actingAs($user)->getJson(route('shows.upcoming.backlog'))
        ->assertOk()
        ->assertJsonCount(1, 'rows')
        ->assertJsonPath('rows.0.id', $unwatched->id);
});

it('excludes specials and untracked shows from the backlog, and isolates per user', function () {
    $user = User::factory()->create();
    $tracked = Show::factory()->create();
    $user->showTrackings()->create(['show_id' => $tracked->id, 'status' => ShowStatus::Watching]);

    $regular = Episode::factory()->create([
        'show_id' => $tracked->id, 'season_number' => 1, 'episode_number' => 1, 'air_date' => today()->subDay(),
    ]);
    // Special (season 0) — excluded like the future feed.
    Episode::factory()->create([
        'show_id' => $tracked->id, 'season_number' => 0, 'episode_number' => 1, 'air_date' => today()->subDay(),
    ]);
    // A show this user doesn't track — excluded.
    $untracked = Show::factory()->create();
    Episode::factory()->create([
        'show_id' => $untracked->id, 'season_number' => 1, 'episode_number' => 1, 'air_date' => today()->subDay(),
    ]);

    $this->actingAs($user)->getJson(route('shows.upcoming.backlog'))
        ->assertOk()
        ->assertJsonCount(1, 'rows')
        ->assertJsonPath('rows.0.id', $regular->id);

    // A member who tracks nothing gets an empty backlog even though rows exist.
    $intruder = User::factory()->create();
    $this->actingAs($intruder)->getJson(route('shows.upcoming.backlog'))
        ->assertOk()
        ->assertJsonCount(0, 'rows');
});

it('cursor-paginates the backlog 15 at a time, oldest continuing from the cursor', function () {
    $user = User::factory()->create();
    $show = Show::factory()->create();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    // 20 aired, unwatched, each a distinct day: subDays(1) is newest (nearest
    // today), subDays(20) the oldest.
    for ($day = 1; $day <= 20; $day++) {
        Episode::factory()->create([
            'show_id' => $show->id,
            'season_number' => 1,
            'episode_number' => $day,
            'air_date' => today()->subDays($day),
        ]);
    }

    $first = $this->actingAs($user)->getJson(route('shows.upcoming.backlog'))
        ->assertOk()
        ->assertJsonCount(15, 'rows')
        ->assertJsonPath('hasMore', true);

    // Newest first: page one is subDays(1)..subDays(15).
    expect($first->json('rows.0.air_date'))->toBe(today()->subDay()->toDateString());
    expect($first->json('rows.14.air_date'))->toBe(today()->subDays(15)->toDateString());

    $cursor = $first->json('nextCursor');
    expect($cursor)->not->toBeNull();

    $second = $this->actingAs($user)->getJson(route('shows.upcoming.backlog', ['cursor' => $cursor]))
        ->assertOk()
        ->assertJsonCount(5, 'rows')
        ->assertJsonPath('hasMore', false)
        ->assertJsonPath('nextCursor', null);

    // Page two picks up exactly where page one left off: subDays(16)..subDays(20).
    expect($second->json('rows.0.air_date'))->toBe(today()->subDays(16)->toDateString());
    expect($second->json('rows.4.air_date'))->toBe(today()->subDays(20)->toDateString());
});

it('groups the backlog by the user\'s timezone, not the UTC storage clock', function () {
    // 8:30pm EDT on Sat 7/11 — already past midnight UTC (Sun 7/12). A naive UTC
    // "today" would treat Saturday's episode as already in the past (backlog);
    // in the user's own timezone it's still today, so it stays in the future feed.
    Carbon::setTestNow(Carbon::parse('2026-07-12 00:30:00', 'UTC'));

    $user = User::factory()->create(['timezone' => 'America/New_York']);
    $show = Show::factory()->create();
    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);

    // Airs Saturday household time — "today", so NOT backlog.
    Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 3, 'episode_number' => 4, 'air_date' => '2026-07-11',
    ]);
    // Aired Friday household time — genuinely in the past, so backlog.
    $friday = Episode::factory()->create([
        'show_id' => $show->id, 'season_number' => 3, 'episode_number' => 3, 'air_date' => '2026-07-10',
    ]);

    $this->actingAs($user)->getJson(route('shows.upcoming.backlog'))
        ->assertOk()
        ->assertJsonCount(1, 'rows')
        ->assertJsonPath('rows.0.id', $friday->id);

    Carbon::setTestNow();
});

/*
|--------------------------------------------------------------------------
| Movies › Upcoming (build order item 10)
|--------------------------------------------------------------------------
*/

it('renders only future movies this user tracks, soonest first, with a day countdown', function () {
    $user = User::factory()->create();

    $past = Movie::factory()->create(['release_date' => today()->subDay()]);
    $releasedToday = Movie::factory()->create(['release_date' => today()]);
    $soon = Movie::factory()->create(['release_date' => today()->addWeek()]);
    $later = Movie::factory()->create(['release_date' => today()->addMonth()]);

    foreach ([$past, $releasedToday, $soon, $later] as $movie) {
        $user->movieTrackings()->create(['movie_id' => $movie->id]);
    }

    $this->actingAs($user)->get(route('movies.upcoming'))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('movies/upcoming')
            ->where('today', today()->toDateString())
            ->has('movies', 3)
            ->where('movies.0.id', $releasedToday->id)
            ->where('movies.0.days_until', 0)
            ->where('movies.1.id', $soon->id)
            ->where('movies.1.days_until', 7)
            ->where('movies.2.id', $later->id)
            ->where('movies.2.days_until', (int) today()->diffInDays(today()->addMonth()))
        );
});

it('isolates upcoming movies per user', function () {
    $owner = User::factory()->create();
    $intruder = User::factory()->create();

    $movie = Movie::factory()->create(['release_date' => today()->addWeek()]);
    $owner->movieTrackings()->create(['movie_id' => $movie->id]);

    $this->actingAs($intruder)->get(route('movies.upcoming'))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('movies/upcoming')
            ->has('movies', 0)
        );

    $this->actingAs($owner)->get(route('movies.upcoming'))
        ->assertOk()
        ->assertInertia(fn (Assert $inertia) => $inertia
            ->component('movies/upcoming')
            ->has('movies', 1)
            ->where('movies.0.id', $movie->id)
        );
});
