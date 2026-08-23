<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\ShowStatus;
use App\Http\Requests\ToggleSeasonWatchedRequest;
use App\Http\Requests\WatchActionRequest;
use App\Models\Episode;
use App\Models\Show;
use App\Models\UserEpisodeWatch;
use App\Services\Library\TrackingStatusService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Per-user episode watched state (spec §10 item 6): toggle a single episode,
 * bulk-toggle a whole season, and read a show's episodes back with this user's
 * watched flags.
 *
 * Design correction from item 5: toggling an episode does NOT require the show
 * to already be tracked. If there's no UserShowTracking row yet, one is
 * auto-created at status "watching" (jumping straight into an episode implies
 * active engagement, not "watch_later") before the toggle proceeds — as if the
 * user had tracked the show and immediately marked the episode.
 *
 * Everything is scoped to the authenticated user: watch rows resolve through
 * $request->user()->episodeWatches(), so one household member can never read or
 * flip another's data. The {episode}/{show} route bindings resolve *shared*
 * metadata (which is household-wide); the per-user row is always keyed by the
 * current user, so there's no foreign watch-row id to guess.
 *
 * Responses are JSON for now so these routes can be driven directly (curl /
 * tinker / tests) before any frontend exists; they become Inertia responses
 * when the Episodes tab lands (spec build-order item 11).
 */
class EpisodeWatchController extends Controller
{
    /**
     * Apply a multi-watch action to one episode for this user. Find-or-creates
     * the per-user watch row (auto-tracking the show as "watching" first), then
     * applies the requested action: increment (mark watched / rewatch),
     * set_once (collapse to one watch), or reset (mark not watched). watched_date
     * tracks the most recent watch.
     */
    public function toggle(WatchActionRequest $request, Episode $episode, TrackingStatusService $trackingStatus): JsonResponse
    {
        $this->ensureShowTracked($request, $episode->show_id);

        $watch = $request->user()->episodeWatches()->firstOrCreate(
            ['episode_id' => $episode->id],
        );

        $watch->applyWatchAction($request->action());
        $watch->save();

        // Marking watched can auto-promote the show's status (Watch Later /
        // Stopped → Watching, everything seen on an ended show → Finished).
        if ($watch->watched) {
            $trackingStatus->recordWatchActivity($request->user(), $episode->show);
        }

        return response()->json(['watch' => $this->present($watch)]);
    }

    /**
     * Mark one episode AND every episode before it (airing order, specials
     * excluded) watched for this user in one batch — the "catch me up to here"
     * action behind the mark-previous prompt. Not a toggle: the target state
     * is always watched. Auto-tracks and derives status like the single
     * toggle.
     */
    public function watchThrough(Request $request, Episode $episode, TrackingStatusService $trackingStatus): JsonResponse
    {
        $this->ensureShowTracked($request, $episode->show_id);

        $episodeIds = Episode::query()
            ->where('show_id', $episode->show_id)
            ->where('season_number', '>', 0)
            ->where(function ($query) use ($episode): void {
                $query->where('season_number', '<', $episode->season_number)
                    ->orWhere(function ($query) use ($episode): void {
                        $query->where('season_number', $episode->season_number)
                            ->where('episode_number', '<=', $episode->episode_number);
                    });
            })
            ->pluck('id');

        // Leave already-watched episodes untouched so their original
        // watched_date survives; only the catch-up episodes get stamped now.
        $alreadyWatched = $request->user()->episodeWatches()
            ->whereIn('episode_id', $episodeIds)
            ->where('watched', true)
            ->pluck('episode_id')
            ->flip();

        $now = now();
        $rows = $episodeIds
            ->reject(fn (int $id): bool => $alreadyWatched->has($id))
            ->map(fn (int $id): array => [
                'user_id' => $request->user()->id,
                'episode_id' => $id,
                'watched' => true,
                'watch_count' => 1,
                'watched_date' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ])
            ->values()
            ->all();

        if ($rows !== []) {
            UserEpisodeWatch::upsert($rows, ['user_id', 'episode_id'], ['watched', 'watch_count', 'watched_date', 'updated_at']);

            $trackingStatus->recordWatchActivity($request->user(), $episode->show);
        }

        return response()->json([
            'show_id' => $episode->show_id,
            'through' => [
                'season_number' => $episode->season_number,
                'episode_number' => $episode->episode_number,
            ],
            'episodes_affected' => count($rows),
        ]);
    }

    /**
     * Mark every episode in one season watched or unwatched for this user, in a
     * single batch upsert (not N queries in a loop). Auto-tracks the show as
     * "watching" first, same as the single toggle.
     */
    public function toggleSeason(ToggleSeasonWatchedRequest $request, Show $show, int $season, TrackingStatusService $trackingStatus): JsonResponse
    {
        $this->ensureShowTracked($request, $show->id);

        $watched = $request->watched();
        $episodeIds = $show->episodes()
            ->where('season_number', $season)
            ->whereNotNull('air_date')
            ->whereDate('air_date', '<=', $request->user()->localToday())
            ->pluck('id');

        // Marking a season watched must not wipe out per-episode rewatch counts:
        // episodes already watched (count > 0) keep their count and date, and only
        // the not-yet-watched ones are bumped to a single watch. Unmarking resets
        // the whole season to zero.
        $targetIds = $episodeIds;

        if ($watched) {
            $alreadyWatched = $request->user()->episodeWatches()
                ->whereIn('episode_id', $episodeIds)
                ->where('watched', true)
                ->pluck('episode_id')
                ->flip();

            $targetIds = $episodeIds->reject(fn (int $id): bool => $alreadyWatched->has($id))->values();
        }

        $now = now();
        $rows = $targetIds->map(fn (int $id): array => [
            'user_id' => $request->user()->id,
            'episode_id' => $id,
            'watched' => $watched,
            'watch_count' => $watched ? 1 : 0,
            'watched_date' => $watched ? $now : null,
            'created_at' => $now,
            'updated_at' => $now,
        ])->all();

        // One write statement: insert rows that don't exist yet, update the rest,
        // keyed by the (user_id, episode_id) unique index — never a per-episode loop.
        if ($rows !== []) {
            UserEpisodeWatch::upsert($rows, ['user_id', 'episode_id'], ['watched', 'watch_count', 'watched_date', 'updated_at']);
        }

        // Same status derivation as the single toggle: bulk-watching a season
        // can promote the show to Watching or complete it into Finished.
        if ($watched && $episodeIds->isNotEmpty()) {
            $trackingStatus->recordWatchActivity($request->user(), $show);
        }

        return response()->json([
            'show_id' => $show->id,
            'season' => $season,
            'watched' => $watched,
            'episodes_affected' => $episodeIds->count(),
        ]);
    }

    /**
     * Read a show's episodes back with this user's watched flag + date on each —
     * the accurate per-user view the Episodes tab will render, and how the
     * toggles above are verified. Scoped: only the current user's watch rows are
     * joined in, so another user's state never leaks.
     */
    public function index(Request $request, Show $show): JsonResponse
    {
        $episodes = $show->episodes()
            ->orderBy('season_number')
            ->orderBy('episode_number')
            ->get();

        $watches = $request->user()->episodeWatches()
            ->whereIn('episode_id', $episodes->pluck('id'))
            ->get()
            ->keyBy('episode_id');

        $payload = $episodes->map(function (Episode $episode) use ($watches): array {
            $watch = $watches->get($episode->id);

            return [
                'episode_id' => $episode->id,
                'season_number' => $episode->season_number,
                'episode_number' => $episode->episode_number,
                'title' => $episode->title,
                'watched' => (bool) $watch?->watched,
                'watch_count' => (int) ($watch->watch_count ?? 0),
                'watched_date' => $watch?->watched_date?->toIso8601String(),
            ];
        });

        return response()->json([
            'show_id' => $show->id,
            'episodes' => $payload,
        ]);
    }

    /**
     * Auto-create this user's tracking row for the show if absent, defaulting to
     * "watching" (per the item 6 design correction). A show already tracked at
     * any status is left untouched.
     */
    private function ensureShowTracked(Request $request, int $showId): void
    {
        $request->user()->showTrackings()->firstOrCreate(
            ['show_id' => $showId],
            ['status' => ShowStatus::Watching],
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function present(UserEpisodeWatch $watch): array
    {
        return [
            'id' => $watch->id,
            'user_id' => $watch->user_id,
            'episode_id' => $watch->episode_id,
            'watched' => $watch->watched,
            'watch_count' => $watch->watch_count,
            'watched_date' => $watch->watched_date?->toIso8601String(),
        ];
    }
}
