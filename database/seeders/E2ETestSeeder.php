<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\ShowStatus;
use App\Models\Episode;
use App\Models\MediaExternalId;
use App\Models\Movie;
use App\Models\Season;
use App\Models\Show;
use App\Models\User;
use App\Models\UserEpisodeWatch;
use App\Models\UserMovieTracking;
use App\Models\UserShowTracking;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class E2ETestSeeder extends Seeder
{
    public function run(): void
    {
        $primary = $this->createUser('E2E Primary User', 'e2e@example.test');
        $secondary = $this->createUser('E2E Secondary User', 'secondary@example.test');
        $this->createUser('E2E Unverified User', 'unverified@example.test', verified: false);

        foreach (['tracking', 'movie', 'profile', 'security', 'import'] as $flow) {
            $this->createUser("E2E {$flow} User", "{$flow}@example.test");
        }

        $ongoing = $this->createShow(
            title: 'Orbital Detectives',
            tmdbId: 90001,
            episodes: [
                [1, 1, 'Launch Day', now()->subDays(30)->toDateString()],
                [1, 2, 'Dark Side Clue', now()->subDays(20)->toDateString()],
                [1, 3, 'Unwatched Signal', now()->subDay()->toDateString()],
                [1, 4, 'Tomorrow Signal', now()->addDay()->toDateString()],
                [2, 1, 'Second Orbit', now()->addDays(8)->toDateString()],
            ],
        );
        $longTitle = $this->createShow(
            title: 'A Remarkably Long Show Title That Wraps Across Two Lines',
            tmdbId: 90002,
            posterUrl: null,
            episodes: [[1, 1, 'Pilot', now()->subDays(10)->toDateString()]],
        );
        $finished = $this->createShow(
            title: 'The Final Chapter',
            tmdbId: 90003,
            ended: true,
            episodes: [[1, 1, 'The End', now()->subYear()->toDateString()]],
        );
        $private = $this->createShow(
            title: 'Secondary User Secret Show',
            tmdbId: 90004,
            episodes: [[1, 1, 'Private Pilot', now()->subDay()->toDateString()]],
        );

        UserShowTracking::query()->create(['user_id' => $primary->id, 'show_id' => $ongoing->id, 'status' => ShowStatus::Watching]);
        UserShowTracking::query()->create(['user_id' => $primary->id, 'show_id' => $longTitle->id, 'status' => ShowStatus::WatchLater]);
        UserShowTracking::query()->create(['user_id' => $primary->id, 'show_id' => $finished->id, 'status' => ShowStatus::Finished]);
        UserShowTracking::query()->create(['user_id' => $secondary->id, 'show_id' => $private->id, 'status' => ShowStatus::Watching]);

        foreach ($ongoing->episodes()->whereIn('episode_number', [1, 2])->get() as $index => $episode) {
            UserEpisodeWatch::query()->create([
                'user_id' => $primary->id,
                'episode_id' => $episode->id,
                'watched' => true,
                'watch_count' => $index + 1,
                'watched_date' => now()->subDays(4 - $index),
            ]);
        }
        UserEpisodeWatch::query()->create([
            'user_id' => $primary->id,
            'episode_id' => $finished->episodes()->firstOrFail()->id,
            'watched' => true,
            'watch_count' => 1,
            'watched_date' => now()->subMonth(),
        ]);

        $collectionMovie = $this->createMovie('Chronicle One', 90101, now()->subYear()->toDateString(), 99001);
        $longCollectionMovie = $this->createMovie('Chronicle Two and the Extremely Long Subtitle', 90102, now()->addMonths(2)->toDateString(), 99001, null);
        $standalone = $this->createMovie('Quiet Standalone', 90103, now()->subMonths(2)->toDateString(), 0);
        $future = $this->createMovie('Tomorrow at the Cinema', 90104, now()->addDays(10)->toDateString(), 0);

        UserMovieTracking::query()->create(['user_id' => $primary->id, 'movie_id' => $collectionMovie->id, 'watched' => true, 'watch_count' => 2, 'watched_date' => now()->subDays(2)]);
        UserMovieTracking::query()->create(['user_id' => $primary->id, 'movie_id' => $longCollectionMovie->id, 'watched' => false, 'watch_count' => 0]);
        UserMovieTracking::query()->create(['user_id' => $primary->id, 'movie_id' => $standalone->id, 'watched' => false, 'watch_count' => 0]);
        UserMovieTracking::query()->create(['user_id' => $primary->id, 'movie_id' => $future->id, 'watched' => false, 'watch_count' => 0]);
    }

    private function createUser(string $name, string $email, bool $verified = true): User
    {
        return User::query()->create([
            'name' => $name,
            'email' => $email,
            'email_verified_at' => $verified ? now() : null,
            'password' => Hash::make('password'),
            'timezone' => 'UTC',
        ]);
    }

    /**
     * @param  list<array{int, int, string, string}>  $episodes
     */
    private function createShow(string $title, int $tmdbId, array $episodes, bool $ended = false, ?string $posterUrl = '/favicon.svg'): Show
    {
        $show = Show::query()->create([
            'title' => $title,
            'poster_image_url' => $posterUrl,
            'overview' => "Overview for {$title}.",
            'ended' => $ended,
        ]);

        foreach (collect($episodes)->groupBy(fn (array $episode): int => $episode[0]) as $seasonNumber => $seasonEpisodes) {
            Season::query()->create(['show_id' => $show->id, 'season_number' => $seasonNumber, 'episode_count' => $seasonEpisodes->count()]);

            foreach ($seasonEpisodes as [$season, $number, $episodeTitle, $airDate]) {
                Episode::query()->create([
                    'show_id' => $show->id,
                    'season_number' => $season,
                    'episode_number' => $number,
                    'title' => $episodeTitle,
                    'still_image_url' => $number % 2 === 0 ? null : '/favicon.svg',
                    'overview' => "Overview for {$episodeTitle}.",
                    'air_date' => $airDate,
                    'runtime_minutes' => 42,
                ]);
            }
        }

        MediaExternalId::query()->create(['media_type' => 'show', 'media_id' => $show->id, 'provider' => 'tmdb', 'external_id' => (string) $tmdbId]);

        return $show;
    }

    private function createMovie(string $title, int $tmdbId, string $releaseDate, int $collectionId, ?string $posterUrl = '/favicon.svg'): Movie
    {
        $movie = Movie::query()->create([
            'title' => $title,
            'poster_image_url' => $posterUrl,
            'overview' => "Overview for {$title}.",
            'release_date' => $releaseDate,
            'runtime_minutes' => 110,
            'tmdb_collection_id' => $collectionId,
        ]);

        MediaExternalId::query()->create(['media_type' => 'movie', 'media_id' => $movie->id, 'provider' => 'tmdb', 'external_id' => (string) $tmdbId]);

        return $movie;
    }
}
