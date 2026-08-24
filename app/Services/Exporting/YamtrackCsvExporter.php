<?php

declare(strict_types=1);

namespace App\Services\Exporting;

use App\Enums\ShowStatus;
use App\Models\Show;
use App\Models\User;
use App\Models\UserEpisodeWatch;
use App\Models\UserShowTracking;
use App\Services\Importing\YamtrackCsvReader;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

class YamtrackCsvExporter
{
    private const CHUNK_SIZE = 100;

    /** @param resource $stream */
    public function write(User $user, mixed $stream): void
    {
        $this->writeRow($stream, YamtrackCsvReader::HEADERS);

        $user->showTrackings()
            ->with([
                'show.externalIds',
                'show.seasons',
                'show.episodes.watches' => fn ($query) => $query
                    ->where('user_id', $user->id)
                    ->where('watched', true),
            ])
            ->orderBy('id')
            ->chunkById(self::CHUNK_SIZE, function (Collection $trackings) use ($stream): void {
                foreach ($trackings as $tracking) {
                    $this->writeShow($stream, $tracking->show, $tracking);
                }
            });

        Show::query()
            ->whereHas('episodes.watches', fn (Builder $query) => $query
                ->where('user_id', $user->id)
                ->where('watched', true))
            ->whereDoesntHave('trackings', fn (Builder $query) => $query->where('user_id', $user->id))
            ->with([
                'externalIds',
                'seasons',
                'episodes.watches' => fn ($query) => $query
                    ->where('user_id', $user->id)
                    ->where('watched', true),
            ])
            ->orderBy('id')
            ->chunkById(self::CHUNK_SIZE, function (Collection $shows) use ($stream): void {
                foreach ($shows as $show) {
                    $this->writeShow($stream, $show, null);
                }
            });

        $user->movieTrackings()
            ->with('movie.externalIds')
            ->orderBy('id')
            ->chunkById(self::CHUNK_SIZE, function (Collection $trackings) use ($stream): void {
                foreach ($trackings as $tracking) {
                    $tmdbId = $tracking->movie->externalIds->firstWhere('provider', 'tmdb')?->external_id;

                    if ($tmdbId === null) {
                        continue;
                    }

                    $watchedAt = $this->timestamp($tracking->watched_date);
                    $this->writeRow($stream, [
                        $tmdbId,
                        'tmdb',
                        'movie',
                        $tracking->movie->title,
                        $tracking->movie->poster_image_url ?? '',
                        '',
                        '',
                        '',
                        $tracking->watched ? 'Completed' : 'Planning',
                        '',
                        '',
                        $watchedAt,
                        $tracking->watched ? 1 : 0,
                        $this->timestamp($tracking->created_at),
                        $watchedAt,
                    ]);
                }
            });
    }

    /** @param resource $stream */
    private function writeShow(mixed $stream, Show $show, ?UserShowTracking $tracking): void
    {
        $tmdbId = $show->externalIds->firstWhere('provider', 'tmdb')?->external_id;

        if ($tmdbId === null) {
            return;
        }

        $watchedEpisodes = $show->episodes
            ->map(function ($episode): ?array {
                $watch = $episode->watches->first();

                if (! $watch instanceof UserEpisodeWatch) {
                    return null;
                }

                return ['episode' => $episode, 'watch' => $watch];
            })
            ->filter()
            ->values();
        $latestWatch = $watchedEpisodes
            ->pluck('watch.watched_date')
            ->filter()
            ->sortDesc()
            ->first();
        $createdAt = $tracking->created_at ?? $watchedEpisodes->pluck('watch.created_at')->filter()->sort()->first();

        $this->writeRow($stream, [
            $tmdbId,
            'tmdb',
            'tv',
            $show->title,
            $show->poster_image_url ?? '',
            '',
            '',
            '',
            $this->showStatus($tracking?->status),
            '',
            '',
            $this->timestamp($latestWatch),
            $watchedEpisodes->count(),
            $this->timestamp($createdAt),
            $this->timestamp($latestWatch),
        ]);

        foreach ($show->seasons->sortBy('season_number') as $season) {
            $seasonProgress = $watchedEpisodes
                ->filter(fn (array $item): bool => $item['episode']->season_number === $season->season_number)
                ->count();
            $seasonStatus = $season->episode_count > 0 && $seasonProgress >= $season->episode_count
                ? 'Completed'
                : ($seasonProgress > 0 ? 'In progress' : 'Planning');

            $this->writeRow($stream, [
                $tmdbId, 'tmdb', 'season', $show->title, $show->poster_image_url ?? '',
                $season->season_number, '', '', $seasonStatus, '', '', '', $seasonProgress,
                $this->timestamp($createdAt), '',
            ]);
        }

        foreach ($watchedEpisodes->sortBy([
            ['episode.season_number', 'asc'],
            ['episode.episode_number', 'asc'],
        ]) as $item) {
            $watchedAt = $this->timestamp($item['watch']->watched_date);
            $this->writeRow($stream, [
                $tmdbId,
                'tmdb',
                'episode',
                $show->title,
                $item['episode']->still_image_url ?? '',
                $item['episode']->season_number,
                $item['episode']->episode_number,
                '',
                '',
                '',
                '',
                $watchedAt,
                '',
                $this->timestamp($item['watch']->created_at),
                $watchedAt,
            ]);
        }
    }

    private function showStatus(?ShowStatus $status): string
    {
        return match ($status) {
            ShowStatus::WatchLater => 'Planning',
            ShowStatus::Finished => 'Completed',
            ShowStatus::Stopped => 'Dropped',
            default => 'In progress',
        };
    }

    private function timestamp(mixed $value): string
    {
        return $value instanceof CarbonInterface ? $value->format('Y-m-d H:i:s.uP') : '';
    }

    /**
     * @param  resource  $stream
     * @param  array<int, int|string>  $row
     */
    private function writeRow(mixed $stream, array $row): void
    {
        fputcsv($stream, $row, ',', '"', '');
    }
}
