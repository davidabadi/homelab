<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Models\Episode;
use App\Models\MediaExternalId;
use App\Models\Show;
use App\Models\User;

it('redirects guests away from a show detail payload', function () {
    $show = Show::factory()->create();

    $this->get(route('shows.show', $show))->assertRedirect(route('login'));
});

it('returns the show with its seasons, episodes and TMDB link as JSON', function () {
    $user = User::factory()->create();
    $show = Show::factory()->create();
    MediaExternalId::create(['media_type' => 'show', 'media_id' => $show->id, 'provider' => 'tmdb', 'external_id' => '1399']);

    $show->seasons()->create(['season_number' => 1, 'episode_count' => 2]);
    $show->seasons()->create(['season_number' => 2, 'episode_count' => 1]);

    $s1e1 = Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1]);
    $s1e2 = Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 2]);
    $s2e1 = Episode::factory()->create(['show_id' => $show->id, 'season_number' => 2, 'episode_number' => 1]);

    $this->actingAs($user)->getJson(route('shows.show', $show))
        ->assertOk()
        ->assertJsonPath('today', $user->localToday()->toDateString())
        ->assertJsonPath('show.id', $show->id)
        ->assertJsonPath('show.title', $show->title)
        ->assertJsonPath('show.season_count', 2)
        ->assertJsonPath('show.tmdb_id', 1399)
        ->assertJsonPath('trackingStatus', null)
        ->assertJsonCount(2, 'seasons')
        ->assertJsonPath('seasons.0.season_number', 1)
        ->assertJsonCount(2, 'seasons.0.episodes')
        ->assertJsonPath('seasons.0.episodes.0.id', $s1e1->id)
        ->assertJsonPath('seasons.0.episodes.1.id', $s1e2->id)
        ->assertJsonPath('seasons.1.season_number', 2)
        ->assertJsonPath('seasons.1.episodes.0.id', $s2e1->id);
});

it('excludes specials (season 0) from the payload entirely', function () {
    $user = User::factory()->create();
    $show = Show::factory()->create();

    $show->seasons()->create(['season_number' => 0, 'episode_count' => 1]);
    $show->seasons()->create(['season_number' => 1, 'episode_count' => 1]);
    Episode::factory()->create(['show_id' => $show->id, 'season_number' => 0, 'episode_number' => 1]);
    $regular = Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1]);

    $this->actingAs($user)->getJson(route('shows.show', $show))
        ->assertOk()
        ->assertJsonPath('show.season_count', 1)
        ->assertJsonCount(1, 'seasons')
        ->assertJsonPath('seasons.0.season_number', 1)
        ->assertJsonCount(1, 'seasons.0.episodes')
        ->assertJsonPath('seasons.0.episodes.0.id', $regular->id);
});

it('carries this user\'s watched flags and tracking status, never another member\'s', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();

    $show = Show::factory()->create();
    $show->seasons()->create(['season_number' => 1, 'episode_count' => 2]);
    $mine = Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 1]);
    $theirs = Episode::factory()->create(['show_id' => $show->id, 'season_number' => 1, 'episode_number' => 2]);

    $user->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Watching]);
    $user->episodeWatches()->create(['episode_id' => $mine->id, 'watched' => true, 'watched_date' => now()]);
    $other->episodeWatches()->create(['episode_id' => $theirs->id, 'watched' => true, 'watched_date' => now()]);
    $other->showTrackings()->create(['show_id' => $show->id, 'status' => ShowStatus::Finished]);

    $this->actingAs($user)->getJson(route('shows.show', $show))
        ->assertOk()
        ->assertJsonPath('trackingStatus', 'watching')
        ->assertJsonPath('seasons.0.episodes.0.watched', true)
        ->assertJsonPath('seasons.0.episodes.0.watched_date', now()->toDateString())
        ->assertJsonPath('seasons.0.episodes.1.watched', false)
        ->assertJsonPath('seasons.0.episodes.1.watched_date', null);
});

it('returns a show that has no TMDB link with a null tmdb_id', function () {
    $show = Show::factory()->create();

    $this->actingAs(User::factory()->create())->getJson(route('shows.show', $show))
        ->assertOk()
        ->assertJsonPath('show.tmdb_id', null)
        ->assertJsonPath('seasons', []);
});

it('404s for a show id that does not exist', function () {
    $this->actingAs(User::factory()->create())
        ->get('/shows/999999')
        ->assertNotFound();
});
