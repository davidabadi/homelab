<?php

declare(strict_types=1);

namespace App\Services\Importing;

use App\Enums\ShowStatus;
use App\Enums\YamtrackImportStrategy;
use App\Models\Episode;
use App\Models\Movie;
use App\Models\Show;
use App\Models\User;
use App\Models\UserEpisodeWatch;
use App\Models\UserMovieTracking;
use App\Models\YamtrackImport;
use App\Services\Library\MediaLibraryService;
use App\Services\Library\TrackingStatusService;
use Carbon\CarbonInterface;
use DomainException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

final readonly class YamtrackImportService
{
    private const ERROR_LIMIT = 100;

    private const WRITE_CHUNK_SIZE = 500;

    public function __construct(
        private YamtrackCsvReader $reader,
        private YamtrackStatusMapper $statusMapper,
        private MediaLibraryService $library,
        private TrackingStatusService $trackingStatus,
    ) {}

    public function process(YamtrackImport $import): void
    {
        $path = Storage::disk('local')->path($import->stored_path);
        $totalRows = $this->reader->countRows($path);
        $import->update(['total_rows' => $totalRows]);

        $snapshot = new YamtrackImportSnapshot;
        $errors = [];
        $processedRows = 0;
        $skippedRows = 0;
        $failedRows = 0;

        foreach ($this->reader->rows($path, function (int $row, string $reason) use (&$errors, &$processedRows, &$skippedRows, $import): void {
            $processedRows++;
            $skippedRows++;
            $this->retainError($errors, $row, $reason);
            $this->persistProgress($import, $processedRows, $skippedRows);
        }) as $row) {
            $snapshot->add($row);
        }

        $import->update([
            'processed_rows' => $processedRows,
            'skipped_rows' => $skippedRows,
            'error_summary' => $errors,
        ]);

        if ($import->strategy === YamtrackImportStrategy::Replace && $skippedRows > 0) {
            throw new DomainException('Replacement was not applied because the CSV contains invalid rows. Fix the reported rows and try again.');
        }

        [$shows, $movies, $failedRows] = $this->resolveMedia(
            $import,
            $snapshot,
            $errors,
            $failedRows,
            $processedRows,
            $skippedRows,
        );
        $episodes = $this->resolveEpisodes($snapshot, $shows, $errors, $failedRows);

        $counters = DB::transaction(fn (): array => $import->strategy === YamtrackImportStrategy::AddMissing
            ? $this->addMissing($import->user, $snapshot, $shows, $movies, $episodes)
            : $this->replace($import->user, $snapshot, $shows, $movies, $episodes));

        $import->update([
            'processed_rows' => $totalRows,
            'successful_rows' => max(0, $totalRows - $skippedRows - $failedRows),
            'skipped_rows' => $skippedRows,
            'failed_rows' => $failedRows,
            'error_summary' => $errors,
            ...$counters,
        ]);
    }

    /**
     * @param  array<int, array{row: int, reason: string}>  $errors
     * @return array{0: array<int, Show>, 1: array<int, Movie>, 2: int}
     */
    private function resolveMedia(
        YamtrackImport $import,
        YamtrackImportSnapshot $snapshot,
        array &$errors,
        int $failedRows,
        int &$processedRows,
        int $skippedRows,
    ): array {
        $shows = [];
        foreach ($snapshot->shows as $tmdbId => $showData) {
            try {
                $shows[$tmdbId] = $this->library->findOrCreateShow($tmdbId);
            } catch (Throwable) {
                $failedRows += count($showData['rows']);
                $this->retainError(
                    $errors,
                    $showData['rows'][0],
                    $this->mediaResolutionError('show', $tmdbId, $showData['title']),
                );
            }

            $processedRows += count($showData['rows']);
            $this->persistProgress($import, $processedRows, $skippedRows, force: true);
        }

        $movies = [];
        foreach ($snapshot->movies as $tmdbId => $movieData) {
            $row = $movieData['row'];
            try {
                $movies[$tmdbId] = $this->library->findOrCreateMovie($tmdbId);
            } catch (Throwable) {
                $failedRows += count($movieData['rows']);
                $this->retainError(
                    $errors,
                    $movieData['rows'][0],
                    $this->mediaResolutionError('movie', $tmdbId, $row->title),
                );
            }

            $processedRows += count($movieData['rows']);
            $this->persistProgress($import, $processedRows, $skippedRows, force: true);
        }

        $import->update(['failed_rows' => $failedRows, 'error_summary' => $errors]);

        return [$shows, $movies, $failedRows];
    }

    /**
     * @param  array<int, Show>  $shows
     * @param  array<int, array{row: int, reason: string}>  $errors
     * @return array<string, Episode>
     */
    private function resolveEpisodes(YamtrackImportSnapshot $snapshot, array $shows, array &$errors, int &$failedRows): array
    {
        $byCoordinate = Episode::query()
            ->whereIn('show_id', array_map(static fn (Show $show): int => $show->id, $shows))
            ->get()
            ->keyBy(static fn (Episode $episode): string => "{$episode->show_id}:{$episode->season_number}:{$episode->episode_number}");

        $episodes = [];
        foreach ($snapshot->episodes as $key => $row) {
            $show = $shows[$row->mediaId] ?? null;
            if ($show === null) {
                continue;
            }

            $episode = $byCoordinate->get("{$show->id}:{$row->seasonNumber}:{$row->episodeNumber}");
            if (! $episode instanceof Episode) {
                $failedRows++;
                $showTitle = $snapshot->shows[$row->mediaId]['title'];
                $showLabel = $showTitle === null ? "TMDB show {$row->mediaId}" : "\"{$showTitle}\" (TMDB show {$row->mediaId})";
                $this->retainError($errors, $row->rowNumber, "Episode S{$row->seasonNumber}E{$row->episodeNumber} was not found for {$showLabel}.");

                continue;
            }

            $episodes[$key] = $episode;
        }

        return $episodes;
    }

    /**
     * @param  array<int, Show>  $shows
     * @param  array<int, Movie>  $movies
     * @param  array<string, Episode>  $episodes
     * @return array<string, int>
     */
    private function addMissing(User $user, YamtrackImportSnapshot $snapshot, array $shows, array $movies, array $episodes): array
    {
        $counters = $this->emptyCounters();
        $completedShows = [];

        foreach ($shows as $tmdbId => $show) {
            $showData = $snapshot->shows[$tmdbId];
            $tracking = $user->showTrackings()->where('show_id', $show->id)->first();
            if ($tracking === null) {
                $user->showTrackings()->create([
                    'show_id' => $show->id,
                    'status' => $this->statusMapper->map($showData['status']) ?? ShowStatus::Watching,
                ]);
                $counters['shows_added']++;
            }

            if ($showData['completed']) {
                $completedShows[] = $show;
            }
        }

        $episodeRows = [];
        $existingEpisodeWatches = $user->episodeWatches()
            ->whereIn('episode_id', array_map(static fn (Episode $episode): int => $episode->id, $episodes))
            ->get()
            ->keyBy('episode_id');
        $now = now();

        foreach ($episodes as $key => $episode) {
            $importRow = $snapshot->episodes[$key];
            $existing = $existingEpisodeWatches->get($episode->id);
            $existingCount = $existing instanceof UserEpisodeWatch ? $existing->watch_count : 0;
            $watchedDate = $existing instanceof UserEpisodeWatch ? $existing->watched_date : null;

            if ($existingCount < 1) {
                $counters['episodes_marked_watched']++;
            }

            if ($importRow->watchedAt !== null && ($watchedDate === null || $importRow->watchedAt->greaterThan($watchedDate))) {
                $watchedDate = $importRow->watchedAt;
            }

            $episodeRows[] = $this->episodeWatchRow($user, $episode, max($existingCount, 1), $watchedDate, $now);
        }
        $this->upsertEpisodeWatches($episodeRows);

        foreach ($movies as $tmdbId => $movie) {
            $importRow = $snapshot->movies[$tmdbId]['row'];
            $existing = $user->movieTrackings()->where('movie_id', $movie->id)->first();
            if ($existing === null) {
                $existing = $user->movieTrackings()->create(['movie_id' => $movie->id]);
                $counters['movies_added']++;
            }

            if (! $this->statusMapper->isCompleted($importRow->status)) {
                continue;
            }

            if ($existing->watch_count < 1) {
                $counters['movies_marked_watched']++;
            }

            $existing->forceFill([
                'watched' => true,
                'watch_count' => max($existing->watch_count, 1),
                'watched_date' => $this->newerDate($existing->watched_date, $importRow->watchedAt),
            ])->save();
        }

        foreach ($completedShows as $show) {
            $this->trackingStatus->finishImportedCompletion($user, $show);
        }

        return $counters;
    }

    /**
     * @param  array<int, Show>  $shows
     * @param  array<int, Movie>  $movies
     * @param  array<string, Episode>  $episodes
     * @return array<string, int>
     */
    private function replace(User $user, YamtrackImportSnapshot $snapshot, array $shows, array $movies, array $episodes): array
    {
        $counters = $this->emptyCounters();
        $showIds = array_map(static fn (Show $show): int => $show->id, $shows);
        $movieIds = array_map(static fn (Movie $movie): int => $movie->id, $movies);
        $episodeIds = array_map(static fn (Episode $episode): int => $episode->id, $episodes);

        $removedShows = $user->showTrackings()->when($showIds !== [], fn ($query) => $query->whereNotIn('show_id', $showIds))->count();
        if ($showIds === []) {
            $user->showTrackings()->delete();
        } else {
            $user->showTrackings()->whereNotIn('show_id', $showIds)->delete();
        }
        $counters['shows_removed'] = $removedShows;

        $watchesToReset = $user->episodeWatches()->where('watched', true);
        if ($episodeIds !== []) {
            $watchesToReset->whereNotIn('episode_id', $episodeIds);
        }
        $counters['episodes_reset'] = $watchesToReset->count();
        $watchesToReset->update(['watched' => false, 'watch_count' => 0, 'watched_date' => null]);

        $completedShows = [];
        foreach ($shows as $tmdbId => $show) {
            $showData = $snapshot->shows[$tmdbId];
            $tracking = $user->showTrackings()->firstOrNew(['show_id' => $show->id]);
            if (! $tracking->exists) {
                $counters['shows_added']++;
            }
            $tracking->status = $this->statusMapper->map($showData['status']) ?? ShowStatus::Watching;
            $tracking->save();

            if ($showData['completed']) {
                $completedShows[] = $show;
            }
        }

        $existingEpisodeWatches = $user->episodeWatches()
            ->whereIn('episode_id', $episodeIds)
            ->get()
            ->keyBy('episode_id');
        $episodeRows = [];
        $now = now();
        foreach ($episodes as $key => $episode) {
            $existing = $existingEpisodeWatches->get($episode->id);
            if (! $existing instanceof UserEpisodeWatch || ! $existing->watched) {
                $counters['episodes_marked_watched']++;
            }
            $episodeRows[] = $this->episodeWatchRow($user, $episode, 1, $snapshot->episodes[$key]->watchedAt, $now);
        }
        $this->upsertEpisodeWatches($episodeRows);

        $existingMovies = $user->movieTrackings()->get()->keyBy('movie_id');
        $absentMovies = $existingMovies->when($movieIds !== [], fn ($items) => $items->whereNotIn('movie_id', $movieIds));
        $counters['movies_removed'] = $absentMovies->count();
        if ($absentMovies->isNotEmpty()) {
            $absentMovies->toQuery()->delete();
        }

        foreach ($movies as $tmdbId => $movie) {
            $importRow = $snapshot->movies[$tmdbId]['row'];
            $watched = $this->statusMapper->isCompleted($importRow->status);
            $existing = $existingMovies->get($movie->id);
            if (! $existing instanceof UserMovieTracking) {
                $counters['movies_added']++;
            } elseif ($existing->watched && ! $watched) {
                $counters['movies_reset']++;
            } elseif (! $existing->watched && $watched) {
                $counters['movies_marked_watched']++;
            }

            UserMovieTracking::query()->updateOrCreate(
                ['user_id' => $user->id, 'movie_id' => $movie->id],
                [
                    'watched' => $watched,
                    'watch_count' => $watched ? 1 : 0,
                    'watched_date' => $watched ? $importRow->watchedAt : null,
                ],
            );
        }

        foreach ($completedShows as $show) {
            $this->trackingStatus->finishImportedCompletion($user, $show);
        }

        return $counters;
    }

    /** @return array<string, int> */
    private function emptyCounters(): array
    {
        return [
            'shows_added' => 0, 'shows_removed' => 0,
            'episodes_marked_watched' => 0, 'episodes_reset' => 0,
            'movies_added' => 0, 'movies_removed' => 0,
            'movies_marked_watched' => 0, 'movies_reset' => 0,
        ];
    }

    /** @return array<string, mixed> */
    private function episodeWatchRow(User $user, Episode $episode, int $count, mixed $watchedDate, CarbonInterface $now): array
    {
        return [
            'user_id' => $user->id,
            'episode_id' => $episode->id,
            'watched' => true,
            'watch_count' => $count,
            'watched_date' => $watchedDate,
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }

    /** @param list<array<string, mixed>> $rows */
    private function upsertEpisodeWatches(array $rows): void
    {
        foreach (array_chunk($rows, self::WRITE_CHUNK_SIZE) as $chunk) {
            UserEpisodeWatch::query()->upsert(
                $chunk,
                ['user_id', 'episode_id'],
                ['watched', 'watch_count', 'watched_date', 'updated_at'],
            );
        }
    }

    private function newerDate(mixed $existing, mixed $imported): mixed
    {
        if ($imported === null) {
            return $existing;
        }

        if ($existing === null || $imported->greaterThan($existing)) {
            return $imported;
        }

        return $existing;
    }

    /** @param array<int, array{row: int, reason: string}> $errors */
    private function retainError(array &$errors, int $row, string $reason): void
    {
        if (count($errors) < self::ERROR_LIMIT) {
            $errors[] = ['row' => $row, 'reason' => $reason];
        }
    }

    private function persistProgress(YamtrackImport $import, int $processedRows, int $skippedRows, bool $force = false): void
    {
        if ($force || $processedRows % 100 === 0) {
            $import->update(['processed_rows' => $processedRows, 'skipped_rows' => $skippedRows]);
        }
    }

    private function mediaResolutionError(string $mediaType, int $tmdbId, ?string $title): string
    {
        if ($title === null) {
            return "TMDB {$mediaType} {$tmdbId} could not be resolved.";
        }

        return "TMDB {$mediaType} \"{$title}\" ({$tmdbId}) could not be resolved.";
    }
}
