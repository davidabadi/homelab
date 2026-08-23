<?php

declare(strict_types=1);

namespace App\Services\Library;

use App\Enums\ShowStatus;
use App\Models\Show;
use App\Models\User;
use App\Models\UserShowTracking;
use Illuminate\Database\Eloquent\Builder;

/**
 * Automatic show-status transitions, so the household never has to manage a
 * status dropdown by hand:
 *
 * - Marking an episode watched on a Watch Later / Stopped show moves it to
 *   Watching (engagement implies active watching).
 * - Once a user has watched every episode of a show TMDB reports as concluded
 *   (shows.ended), their tracking flips to Finished — either at toggle time or
 *   during the nightly refresh (for the "finale watched, TMDB marks the show
 *   Ended later" case).
 *
 * Finished is only ever derived, never forced: a revived show (ended flips
 * back to false, new episodes appear) simply stops qualifying — the nightly
 * sync keeps `ended` fresh for exactly that reason.
 */
final class TrackingStatusService
{
    /**
     * Re-derive one user's status for a show after they marked episodes
     * watched. The Finished check costs a watch-rows query, so it only runs
     * for concluded shows.
     */
    public function recordWatchActivity(User $user, Show $show): void
    {
        $tracking = $user->showTrackings()->where('show_id', $show->id)->first();

        if ($tracking === null) {
            return;
        }

        if ($show->ended && $this->hasWatchedEverything($user->id, $show)) {
            $this->finish($tracking);

            return;
        }

        if (in_array($tracking->status, [ShowStatus::WatchLater, ShowStatus::Stopped], true)) {
            $tracking->update(['status' => ShowStatus::Watching]);
        }
    }

    /**
     * Nightly-sync pass for one concluded show: any user still "watching" who
     * has seen every episode gets flipped to Finished. Covers the case where
     * the user watched the finale before TMDB marked the show Ended.
     */
    public function finishCompletedTrackings(Show $show): void
    {
        if (! $show->ended) {
            return;
        }

        $show->trackings()
            ->where('status', ShowStatus::Watching)
            ->get()
            ->each(function (UserShowTracking $tracking) use ($show): void {
                if ($this->hasWatchedEverything($tracking->user_id, $show)) {
                    $this->finish($tracking);
                }
            });
    }

    /**
     * Apply only the automatic completion rule after an authoritative import.
     * The import's explicit TV status remains primary for Planning/Paused/
     * Dropped rows; Completed is allowed to become Finished only when the same
     * concluded-show, regular-episode rule used by interactive tracking passes.
     */
    public function finishImportedCompletion(User $user, Show $show): void
    {
        $tracking = $user->showTrackings()->where('show_id', $show->id)->first();

        if ($tracking !== null && $show->ended && $this->hasWatchedEverything($user->id, $show)) {
            $this->finish($tracking);
        }
    }

    private function finish(UserShowTracking $tracking): void
    {
        if ($tracking->status !== ShowStatus::Finished) {
            $tracking->update(['status' => ShowStatus::Finished]);
        }
    }

    /**
     * True when the show has regular episodes and none of them lacks a
     * watched=true row for this user. Specials (season 0) are not part of a
     * show for completion purposes — they never block Finished.
     */
    private function hasWatchedEverything(int $userId, Show $show): bool
    {
        $regularEpisodes = $show->episodes()->where('season_number', '>', 0);

        if (! $regularEpisodes->clone()->exists()) {
            return false;
        }

        return ! $regularEpisodes
            ->whereDoesntHave('watches', function (Builder $query) use ($userId): void {
                $query->where('user_id', $userId)->where('watched', true);
            })
            ->exists();
    }
}
