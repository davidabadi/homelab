<?php

declare(strict_types=1);

namespace App\Concerns;

use App\Enums\WatchAction;
use Carbon\CarbonImmutable;

/**
 * Multi-watch count behaviour shared by UserEpisodeWatch and UserMovieTracking:
 * a user can watch an episode/movie more than once, so watched state is a count
 * rather than a boolean. `watched` is kept in sync as a derived flag
 * (watched = watch_count > 0) so the status queries elsewhere keep working, and
 * `watched_date` always reflects the most recent watch.
 *
 * None of these persist — the caller saves.
 *
 * @property int $watch_count
 * @property bool $watched
 * @property CarbonImmutable|null $watched_date
 */
trait TracksWatchCount
{
    /**
     * Keep the derived `watched` flag and `watch_count` consistent on every
     * model save, whatever route set them: watched with no count becomes a
     * single watch, and unwatched forces the count to zero. (Bulk upserts set
     * both columns explicitly and bypass model events, so they're unaffected.)
     */
    protected static function bootTracksWatchCount(): void
    {
        static::saving(function (self $model): void {
            if (! $model->watched) {
                $model->watch_count = 0;
            } elseif ((int) $model->watch_count < 1) {
                $model->watch_count = 1;
            }
        });
    }

    /**
     * Apply a watched-toggle intent from the multi-watch action sheet.
     */
    public function applyWatchAction(WatchAction $action): void
    {
        match ($action) {
            WatchAction::Increment => $this->incrementWatch(),
            WatchAction::SetOnce => $this->setWatchCount(1),
            WatchAction::Reset => $this->setWatchCount(0),
        };
    }

    /**
     * Record one more watch (a first watch or a rewatch), stamping "now" as the
     * most recent watch date.
     */
    public function incrementWatch(): void
    {
        $this->watch_count = max(0, (int) $this->watch_count) + 1;
        $this->watched = true;
        $this->watched_date = now();
    }

    /**
     * Force the count to an exact value: 0 clears watched state and the date;
     * anything positive marks it watched, keeping an existing watch date or
     * stamping "now" if there wasn't one.
     */
    public function setWatchCount(int $count): void
    {
        $this->watch_count = max(0, $count);
        $this->watched = $this->watch_count > 0;
        $this->watched_date = $this->watched ? ($this->watched_date ?? now()) : null;
    }
}
