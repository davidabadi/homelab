<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Jobs\RefreshMovieMetadata;
use App\Jobs\RefreshShowMetadata;
use App\Models\Movie;
use App\Models\Show;
use Illuminate\Console\Command;
use Illuminate\Contracts\Database\Query\Builder;

/**
 * Nightly TMDB refresh fan-out (spec §6, build-order item 7). Registered on the
 * scheduler in routes/console.php and runnable by hand as `php artisan
 * tmdb:refresh` to trigger it immediately.
 *
 * This command does no TMDB work itself: it queues one job per show/movie so the
 * real network calls run through the queue worker, independently. A failure or a
 * slow response on one title can't block the others.
 *
 *   - Every show with at least one tracking row is refreshed unconditionally
 *     (new episodes/seasons can appear at any time).
 *   - Only movies still missing a confirmed release_date or runtime are
 *     refreshed; a movie with both already set is skipped rather than re-fetched
 *     every night for nothing. TMDB reports an unknown runtime as 0 for
 *     unreleased films, so a 0 runtime counts as "not yet confirmed" and keeps
 *     the movie in the refresh set until a real runtime lands.
 */
class RefreshTrackedMedia extends Command
{
    protected $signature = 'tmdb:refresh';

    protected $description = 'Queue nightly TMDB refresh jobs for every tracked show and every tracked movie missing confirmed metadata';

    public function handle(): int
    {
        $shows = Show::query()->whereHas('trackings')->get();

        foreach ($shows as $show) {
            RefreshShowMetadata::dispatch($show);
        }

        $movies = Movie::query()
            ->whereHas('trackings')
            ->where(function (Builder $query): void {
                $query->whereNull('release_date')
                    ->orWhereNull('runtime_minutes')
                    ->orWhere('runtime_minutes', 0);
            })
            ->get();

        foreach ($movies as $movie) {
            RefreshMovieMetadata::dispatch($movie);
        }

        $this->info("Queued {$shows->count()} show refresh job(s) and {$movies->count()} movie refresh job(s).");

        return self::SUCCESS;
    }
}
