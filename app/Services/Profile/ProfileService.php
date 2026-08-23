<?php

declare(strict_types=1);

namespace App\Services\Profile;

use App\Enums\ShowStatus;
use App\Models\Episode;
use App\Models\Movie;
use App\Models\Show;
use App\Models\User;
use App\Models\UserEpisodeWatch;
use App\Models\UserMovieTracking;
use App\Models\UserShowTracking;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class ProfileService
{
    /**
     * Build the deliberately small first-paint payload for the Profile page.
     *
     * @return array{
     *     user: array{name: string, email: string},
     *     stats: array{tv_minutes: int, episodes_watched: int, movie_minutes: int, movies_watched: int},
     *     recentShows: list<array{id: int, title: string, poster_url: string|null}>,
     *     recentMovies: list<array{id: int, title: string, poster_url: string|null}>
     * }
     */
    public function profile(User $user): array
    {
        return [
            'user' => [
                'name' => $user->name,
                'email' => $user->email,
            ],
            'stats' => $this->stats($user),
            'recentShows' => $this->recentShows($user),
            'recentMovies' => $this->recentMovies($user),
        ];
    }

    /**
     * @return array{groups: list<array{key: string, shows: list<array<string, mixed>>}>}
     */
    public function showLibrary(User $user): array
    {
        $episodeTable = (new Episode)->getTable();
        $showTable = (new Show)->getTable();
        $trackingTable = (new UserShowTracking)->getTable();
        $watchTable = (new UserEpisodeWatch)->getTable();
        $today = $user->localToday()->toDateString();

        $airedEpisodes = DB::table($episodeTable)
            ->select("{$episodeTable}.show_id")
            ->selectRaw('COUNT(*) AS episode_count')
            ->where("{$episodeTable}.season_number", '>', 0)
            ->whereNotNull("{$episodeTable}.air_date")
            ->whereDate("{$episodeTable}.air_date", '<=', $today)
            ->groupBy("{$episodeTable}.show_id");

        $watchedAiredEpisodes = DB::table($watchTable)
            ->join($episodeTable, "{$episodeTable}.id", '=', "{$watchTable}.episode_id")
            ->select("{$episodeTable}.show_id")
            ->selectRaw('COUNT(*) AS episode_count')
            ->where("{$watchTable}.user_id", $user->id)
            ->where("{$watchTable}.watch_count", '>', 0)
            ->where("{$episodeTable}.season_number", '>', 0)
            ->whereNotNull("{$episodeTable}.air_date")
            ->whereDate("{$episodeTable}.air_date", '<=', $today)
            ->groupBy("{$episodeTable}.show_id");

        $recentWatches = $this->recentShowWatchesQuery($user);

        $rows = DB::table($trackingTable)
            ->join($showTable, "{$showTable}.id", '=', "{$trackingTable}.show_id")
            ->leftJoinSub($airedEpisodes, 'aired_episodes', fn ($join) => $join->on('aired_episodes.show_id', '=', "{$showTable}.id"))
            ->leftJoinSub($watchedAiredEpisodes, 'watched_aired_episodes', fn ($join) => $join->on('watched_aired_episodes.show_id', '=', "{$showTable}.id"))
            ->leftJoinSub($recentWatches, 'recent_watches', fn ($join) => $join->on('recent_watches.show_id', '=', "{$showTable}.id"))
            ->where("{$trackingTable}.user_id", $user->id)
            ->select([
                "{$trackingTable}.id as tracking_id",
                "{$trackingTable}.status",
                "{$trackingTable}.updated_at as tracking_updated_at",
                "{$showTable}.id",
                "{$showTable}.title",
                "{$showTable}.poster_image_url as poster_url",
            ])
            ->selectRaw('COALESCE(aired_episodes.episode_count, 0) AS aired_episode_count')
            ->selectRaw('COALESCE(watched_aired_episodes.episode_count, 0) AS watched_aired_episode_count')
            ->addSelect(['recent_watches.last_watched_at', 'recent_watches.last_watch_id'])
            ->orderByRaw('CASE WHEN recent_watches.last_watched_at IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('recent_watches.last_watched_at')
            ->orderByDesc('recent_watches.last_watch_id')
            ->orderByDesc("{$trackingTable}.updated_at")
            ->orderByDesc("{$trackingTable}.id")
            ->get();

        $grouped = [];

        foreach ($rows as $row) {
            $row = (array) $row;
            $aired = (int) $row['aired_episode_count'];
            $watched = min($aired, (int) $row['watched_aired_episode_count']);
            $key = $this->showGroupKey((string) $row['status'], $watched, $aired);
            $grouped[$key][] = [
                'id' => (int) $row['id'],
                'title' => (string) $row['title'],
                'poster_url' => $row['poster_url'],
                'progress' => [
                    'watched' => $watched,
                    'aired' => $aired,
                    'percentage' => $aired === 0 ? 0 : min(100, (int) round(($watched / $aired) * 100)),
                    'visible' => $key !== 'watch_later' || $watched > 0,
                ],
            ];
        }

        $groups = [];

        foreach (['watching', 'watch_later', 'up_to_date', 'finished', 'stopped'] as $key) {
            if (! empty($grouped[$key])) {
                $groups[] = ['key' => $key, 'shows' => $grouped[$key]];
            }
        }

        return ['groups' => $groups];
    }

    /**
     * @return array{groups: list<array{key: string, movies: list<array{id: int, title: string, poster_url: string|null}>}>}
     */
    public function movieLibrary(User $user): array
    {
        $movieTable = (new Movie)->getTable();
        $trackingTable = (new UserMovieTracking)->getTable();

        $rows = DB::table($trackingTable)
            ->join($movieTable, "{$movieTable}.id", '=', "{$trackingTable}.movie_id")
            ->where("{$trackingTable}.user_id", $user->id)
            ->select([
                "{$trackingTable}.id as tracking_id",
                "{$trackingTable}.watch_count",
                "{$trackingTable}.watched_date",
                "{$trackingTable}.updated_at as tracking_updated_at",
                "{$movieTable}.id",
                "{$movieTable}.title",
                "{$movieTable}.poster_image_url as poster_url",
            ])
            ->orderByRaw('CASE WHEN watch_count > 0 THEN 0 ELSE 1 END')
            ->orderByDesc("{$trackingTable}.watched_date")
            ->orderByDesc("{$trackingTable}.updated_at")
            ->orderByDesc("{$trackingTable}.id")
            ->get();

        $watched = [];
        $notWatched = [];

        foreach ($rows as $row) {
            $row = (array) $row;
            $movie = [
                'id' => (int) $row['id'],
                'title' => (string) $row['title'],
                'poster_url' => $row['poster_url'],
            ];

            if ((int) $row['watch_count'] > 0) {
                $watched[] = $movie;
            } else {
                $notWatched[] = $movie;
            }
        }

        $groups = [];

        if ($watched !== []) {
            $groups[] = ['key' => 'watched', 'movies' => $watched];
        }

        if ($notWatched !== []) {
            $groups[] = ['key' => 'not_watched', 'movies' => $notWatched];
        }

        return ['groups' => $groups];
    }

    /**
     * @return array{tv_minutes: int, episodes_watched: int, movie_minutes: int, movies_watched: int}
     */
    private function stats(User $user): array
    {
        $episodeTable = (new Episode)->getTable();
        $episodeWatchTable = (new UserEpisodeWatch)->getTable();
        $movieTable = (new Movie)->getTable();
        $movieTrackingTable = (new UserMovieTracking)->getTable();

        $episodeStats = DB::table("{$episodeWatchTable} as episode_watches")
            ->join("{$episodeTable} as episodes", 'episodes.id', '=', 'episode_watches.episode_id')
            ->where('episode_watches.user_id', $user->id)
            ->where('episode_watches.watch_count', '>', 0)
            ->selectRaw('COALESCE(SUM(episode_watches.watch_count), 0) AS watched_count')
            ->selectRaw('COALESCE(SUM(COALESCE(episodes.runtime_minutes, 0) * episode_watches.watch_count), 0) AS watched_minutes')
            ->first();

        $movieStats = DB::table("{$movieTrackingTable} as movie_trackings")
            ->join("{$movieTable} as movies", 'movies.id', '=', 'movie_trackings.movie_id')
            ->where('movie_trackings.user_id', $user->id)
            ->where('movie_trackings.watch_count', '>', 0)
            ->selectRaw('COALESCE(SUM(movie_trackings.watch_count), 0) AS watched_count')
            ->selectRaw('COALESCE(SUM(COALESCE(movies.runtime_minutes, 0) * movie_trackings.watch_count), 0) AS watched_minutes')
            ->first();

        return [
            'tv_minutes' => (int) ($episodeStats->watched_minutes ?? 0),
            'episodes_watched' => (int) ($episodeStats->watched_count ?? 0),
            'movie_minutes' => (int) ($movieStats->watched_minutes ?? 0),
            'movies_watched' => (int) ($movieStats->watched_count ?? 0),
        ];
    }

    /**
     * @return list<array{id: int, title: string, poster_url: string|null}>
     */
    private function recentShows(User $user): array
    {
        $showTable = (new Show)->getTable();
        $trackingTable = (new UserShowTracking)->getTable();
        $recentWatches = $this->recentShowWatchesQuery($user);

        return array_values(DB::table($trackingTable)
            ->join($showTable, "{$showTable}.id", '=', "{$trackingTable}.show_id")
            ->leftJoinSub($recentWatches, 'recent_watches', fn ($join) => $join->on('recent_watches.show_id', '=', "{$showTable}.id"))
            ->where("{$trackingTable}.user_id", $user->id)
            ->select([
                "{$trackingTable}.id as tracking_id",
                "{$showTable}.id",
                "{$showTable}.title",
                "{$showTable}.poster_image_url as poster_url",
            ])
            ->orderByRaw('CASE WHEN recent_watches.last_watched_at IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('recent_watches.last_watched_at')
            ->orderByDesc('recent_watches.last_watch_id')
            ->orderByDesc("{$trackingTable}.updated_at")
            ->orderByDesc("{$trackingTable}.id")
            ->limit(20)
            ->get()
            ->map(fn (object $row): array => [
                'id' => (int) $row->id,
                'title' => (string) $row->title,
                'poster_url' => is_string($row->poster_url) ? $row->poster_url : null,
            ])
            ->all());
    }

    /**
     * @return list<array{id: int, title: string, poster_url: string|null}>
     */
    private function recentMovies(User $user): array
    {
        $movieTable = (new Movie)->getTable();
        $trackingTable = (new UserMovieTracking)->getTable();

        return array_values(DB::table($trackingTable)
            ->join($movieTable, "{$movieTable}.id", '=', "{$trackingTable}.movie_id")
            ->where("{$trackingTable}.user_id", $user->id)
            ->select([
                "{$trackingTable}.id as tracking_id",
                "{$movieTable}.id",
                "{$movieTable}.title",
                "{$movieTable}.poster_image_url as poster_url",
            ])
            ->orderByRaw('CASE WHEN watch_count > 0 THEN 0 ELSE 1 END')
            ->orderByDesc("{$trackingTable}.watched_date")
            ->orderByDesc("{$trackingTable}.updated_at")
            ->orderByDesc("{$trackingTable}.id")
            ->limit(20)
            ->get()
            ->map(fn (object $row): array => [
                'id' => (int) $row->id,
                'title' => (string) $row->title,
                'poster_url' => is_string($row->poster_url) ? $row->poster_url : null,
            ])
            ->all());
    }

    private function recentShowWatchesQuery(User $user): Builder
    {
        $episodeTable = (new Episode)->getTable();
        $watchTable = (new UserEpisodeWatch)->getTable();

        return DB::table("{$watchTable} as episode_watches")
            ->join("{$episodeTable} as episodes", 'episodes.id', '=', 'episode_watches.episode_id')
            ->select('episodes.show_id')
            ->selectRaw('MAX(episode_watches.watched_date) AS last_watched_at')
            ->selectRaw('MAX(episode_watches.id) AS last_watch_id')
            ->where('episode_watches.user_id', $user->id)
            ->where('episode_watches.watch_count', '>', 0)
            ->groupBy('episodes.show_id');
    }

    private function showGroupKey(string $status, int $watched, int $aired): string
    {
        return match ($status) {
            ShowStatus::Watching->value => $watched < $aired ? 'watching' : 'up_to_date',
            ShowStatus::WatchLater->value => 'watch_later',
            ShowStatus::Finished->value => 'finished',
            ShowStatus::Stopped->value => 'stopped',
            default => 'watch_later',
        };
    }
}
