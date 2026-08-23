<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\ShowStatus;
use App\Models\Episode;
use App\Models\Movie;
use App\Models\Show;
use App\Models\User;
use App\Models\UserEpisodeWatch;
use App\Models\UserShowTracking;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The Watch List sub-tabs (spec §5, build order item 9): the logged-in user's
 * "what do I watch next" surface for Shows and Movies, derived by query from the
 * shared metadata + this user's own tracking/watch rows.
 *
 * Shows split by progress: shows with at least one watched episode land in
 * "Watch Next" (pointed at their next unwatched released episode), shows with no
 * progress land in "Haven't Started". A watching show that's fully caught up (no
 * unwatched released episode left) simply drops off the list until a new episode
 * releases — there's nothing to watch next.
 *
 * Everything is scoped to the authenticated user; another household member's
 * progress never appears here.
 */
class WatchListController extends Controller
{
    /**
     * Shows › Watch List: Watch Next / Haven't Started, a count for the "See
     * Watch Later Shows" button, and the Watch Later rows themselves as an
     * optional prop — evaluated only when the client reveals that section inline
     * (partial reload), never on the initial page load.
     */
    public function shows(Request $request): Response
    {
        $user = $request->user();

        $trackings = $user->showTrackings()
            ->where('status', ShowStatus::Watching)
            ->with(['show' => function ($query): void {
                $query->with(['episodes' => function ($query): void {
                    $query->where('season_number', '>', 0)
                        ->orderBy('season_number')
                        ->orderBy('episode_number');
                }]);
            }])
            ->get();

        $watches = $this->watchesFor($user, $trackings);

        $today = $user->localToday();
        $watchNext = [];
        $haventStarted = [];

        foreach ($trackings as $tracking) {
            $row = $this->buildShowRow($tracking->show, $watches, ShowStatus::Watching, $today);

            match ($row['section']) {
                'watch_next' => $watchNext[] = $row,
                'havent_started' => $haventStarted[] = $row,
                // Fully caught up: nothing to watch next, so it drops off.
                default => null,
            };
        }

        // Watch Next is ordered by how recently the user last watched an episode
        // of each show — the show you were most recently watching sits on top.
        usort($watchNext, function (array $a, array $b): int {
            $recentlyWatched = ($b['last_watched_at'] ?? '') <=> ($a['last_watched_at'] ?? '');

            return $recentlyWatched !== 0
                ? $recentlyWatched
                : $a['show_id'] <=> $b['show_id'];
        });

        return Inertia::render('shows', [
            'watchNext' => $watchNext,
            'haventStarted' => $haventStarted,
            'watchLaterCount' => $user->showTrackings()->where('status', ShowStatus::WatchLater)->count(),
            'watchLater' => Inertia::optional(fn (): array => $this->watchLaterRows($user)),
        ]);
    }

    /**
     * Shows the user parked for later (spec §5), same row shape as Watch Next,
     * each pointed at where they'd start (first unwatched released episode).
     * Revealed inline on the Shows watch list rather than a separate page.
     *
     * @return array<int, array<string, mixed>>
     */
    private function watchLaterRows(User $user): array
    {
        $trackings = $user->showTrackings()
            ->where('status', ShowStatus::WatchLater)
            ->with(['show' => function ($query): void {
                $query->with(['episodes' => function ($query): void {
                    $query->where('season_number', '>', 0)
                        ->orderBy('season_number')
                        ->orderBy('episode_number');
                }]);
            }])
            ->get();

        $watches = $this->watchesFor($user, $trackings);
        $today = $user->localToday();

        return $trackings
            ->map(fn (UserShowTracking $tracking): array => $this->buildShowRow($tracking->show, $watches, ShowStatus::WatchLater, $today))
            ->values()
            ->all();
    }

    /**
     * Movies › Watch List: a "Watch Next" grid of movies this user tracks but
     * hasn't watched yet (spec §5). `trackedCount` distinguishes "nothing tracked"
     * from "tracked everything watched" for the empty state.
     */
    public function movies(Request $request): Response
    {
        $user = $request->user();
        $today = $user->localToday();

        $watchNext = $user->movieTrackings()
            ->where('watched', false)
            ->whereHas('movie', function ($query) use ($today): void {
                $query->whereNotNull('release_date')
                    ->whereDate('release_date', '<=', $today);
            })
            ->with('movie:id,title,poster_image_url,release_date')
            ->get()
            ->sortBy(fn ($tracking): string => (string) $tracking->movie?->title)
            ->map(fn ($tracking): array => $this->presentMovie($tracking->movie, 0))
            ->values()
            ->all();

        return Inertia::render('movies', [
            'watchNext' => $watchNext,
            'trackedCount' => $user->movieTrackings()->count(),
        ]);
    }

    /**
     * Shows › Watch List › Watched History (spec Part 2 §3): this user's watched
     * episodes, one row per episode at its most recent watch, newest first.
     * Cursor-paginated 15 at a time so the Shows screen can lazily load older
     * entries as the user scrolls up — it isn't part of the initial page payload.
     *
     * JSON (not Inertia props): the history is fetched on demand by the client,
     * never rendered on first load. Scoped to the authenticated user.
     */
    public function history(Request $request): JsonResponse
    {
        $user = $request->user();
        $perPage = 15;

        $query = $user->episodeWatches()
            ->where('watched', true)
            ->whereNotNull('watched_date')
            ->with('episode.show')
            ->orderByDesc('watched_date')
            ->orderByDesc('id');

        // Keyset cursor "<iso watched_date>,<id>": everything strictly older than
        // the last row of the previous page, ties broken by id so a batch of
        // episodes stamped at the same instant paginates deterministically.
        $cursor = $request->query('cursor');

        if (is_string($cursor) && str_contains($cursor, ',')) {
            [$date, $id] = explode(',', $cursor, 2);
            $watchedAt = Carbon::parse($date);
            $lastId = (int) $id;

            $query->where(function ($query) use ($watchedAt, $lastId): void {
                $query->where('watched_date', '<', $watchedAt)
                    ->orWhere(function ($query) use ($watchedAt, $lastId): void {
                        $query->where('watched_date', $watchedAt)
                            ->where('id', '<', $lastId);
                    });
            });
        }

        $watches = $query->limit($perPage + 1)->get();
        $hasMore = $watches->count() > $perPage;
        $watches = $watches->take($perPage);

        $last = $watches->last();
        $nextCursor = $hasMore && $last !== null
            ? $last->watched_date->toIso8601String().','.$last->id
            : null;

        return response()->json([
            // Newest first; the client reverses these for its oldest-at-top,
            // newest-adjacent-to-Watch-Next layout.
            'rows' => $watches->map(fn (UserEpisodeWatch $watch): array => $this->presentHistoryRow($watch))->all(),
            'nextCursor' => $nextCursor,
            'hasMore' => $hasMore,
        ]);
    }

    /**
     * This user's watched episode rows (keyed by episode_id) across every episode
     * of the given trackings' shows, in one query — carrying the watch count and
     * the watched_date the Watch List needs for its "most recently watched" order.
     *
     * @param  Collection<int, UserShowTracking>  $trackings
     * @return Collection<int, UserEpisodeWatch>
     */
    private function watchesFor(User $user, Collection $trackings): Collection
    {
        $episodeIds = $trackings
            ->flatMap(fn (UserShowTracking $tracking): Collection => $tracking->show->episodes ?? collect())
            ->pluck('id');

        return $user->episodeWatches()
            ->whereIn('episode_id', $episodeIds)
            ->where('watched', true)
            ->get()
            ->keyBy('episode_id');
    }

    /**
     * Fold one show + this user's watch rows into a watch-list row: which section
     * it belongs to, the episode to surface, how many unwatched released episodes
     * remain after it, a display badge, and when the user last watched an episode
     * of it (for ordering Watch Next).
     *
     * @param  Collection<int, UserEpisodeWatch>  $watches  episode_id => watch row
     * @param  CarbonInterface  $today  the user's local calendar day (at UTC midnight)
     * @return array<string, mixed>
     */
    private function buildShowRow(Show $show, Collection $watches, ShowStatus $status, CarbonInterface $today): array
    {
        $episodes = $show->episodes; // already season>0, ordered

        $released = $episodes->filter(
            fn (Episode $episode): bool => $episode->air_date !== null && $episode->air_date->lessThanOrEqualTo($today)
        )->values();

        $unwatchedReleased = $released->filter(
            fn (Episode $episode): bool => ! $watches->has($episode->id)
        )->values();

        $watchedCount = $released->count() - $unwatchedReleased->count();

        // The episode to surface, and how many unwatched released episodes come
        // after it. Haven't-started shows without any released episode still get
        // a row (pointed at their first episode) so they don't disappear.
        $next = $unwatchedReleased->first() ?? $episodes->first();
        $remaining = max(0, $unwatchedReleased->count() - 1);

        if ($watchedCount === 0) {
            $section = 'havent_started';
        } elseif ($unwatchedReleased->isNotEmpty()) {
            $section = 'watch_next';
        } else {
            // Fully caught up on everything released: surface the latest episode.
            $section = 'caught_up';
            $next = $released->last() ?? $episodes->last();
            $remaining = 0;
        }

        // The most recent watch across this show's episodes, for ordering.
        $lastWatchedAt = $episodes
            ->map(fn (Episode $episode) => $watches->get($episode->id)?->watched_date)
            ->filter()
            ->max();

        // The episode after the surfaced one, so the client can advance the row
        // in place (reveal-then-reorder) without a round trip.
        $following = $section === 'caught_up' ? null : $unwatchedReleased->get(1);

        return [
            'show_id' => $show->id,
            'show_title' => $show->title,
            'show_poster_url' => $show->poster_image_url,
            'section' => $section,
            // The show's own list status + whether it has any watched episode:
            // together these drive the left-swipe status menu's option set
            // (spec Part 2 §2).
            'status' => $status->value,
            'has_progress' => $watchedCount > 0,
            'remaining' => $remaining,
            'last_watched_at' => $lastWatchedAt?->toIso8601String(),
            'badge' => $next ? $this->badgeFor($section, $next, $remaining, $today) : null,
            'episode' => $next ? $this->presentEpisode($next, $watches) : null,
            'next_episode' => $following ? $this->presentEpisode($following, $watches) : null,
        ];
    }

    /**
     * A single Watched History row: the surfaced episode is the watched one
     * itself (not a "next unwatched"), carrying the watch count for the "×N"
     * badge. Reuses the shared show-row shape so the client renders it with the
     * same component. status/has_progress are irrelevant here (history rows have
     * no swipe menu), so status is null.
     *
     * @return array<string, mixed>
     */
    private function presentHistoryRow(UserEpisodeWatch $watch): array
    {
        $episode = $watch->episode;
        $show = $episode?->show;

        return [
            'show_id' => $show?->id,
            'show_title' => $show?->title,
            'show_poster_url' => $show?->poster_image_url,
            'section' => 'watched_history',
            'status' => null,
            'has_progress' => true,
            'remaining' => 0,
            'last_watched_at' => $watch->watched_date?->toIso8601String(),
            'badge' => null,
            'episode' => $episode === null ? null : [
                'id' => $episode->id,
                'season_number' => $episode->season_number,
                'episode_number' => $episode->episode_number,
                'title' => $episode->title,
                'air_date' => $episode->air_date?->toDateString(),
                'watch_count' => (int) $watch->watch_count,
            ],
            'next_episode' => null,
        ];
    }

    /**
     * @param  Collection<int, UserEpisodeWatch>  $watches
     * @return array<string, mixed>
     */
    private function presentEpisode(Episode $episode, Collection $watches): array
    {
        return [
            'id' => $episode->id,
            'season_number' => $episode->season_number,
            'episode_number' => $episode->episode_number,
            'title' => $episode->title,
            'air_date' => $episode->air_date?->toDateString(),
            'watch_count' => (int) ($watches->get($episode->id)->watch_count ?? 0),
        ];
    }

    /**
     * The small status pill on a show row: PREMIERE for a new season opener you
     * haven't started, NEW for a very recent episode, LATEST when this is the
     * most recent released episode.
     */
    private function badgeFor(string $section, Episode $episode, int $remaining, CarbonInterface $today): ?string
    {
        if ($section === 'watch_next' && $episode->episode_number === 1) {
            return 'premiere';
        }

        if ($episode->air_date !== null && $episode->air_date->greaterThanOrEqualTo($today->copy()->subDays(7))) {
            return 'new';
        }

        if ($section === 'watch_next' && $remaining === 0) {
            return 'latest';
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    private function presentMovie(?Movie $movie, int $watchCount): array
    {
        return [
            'id' => $movie?->id,
            'title' => $movie?->title,
            'poster_url' => $movie?->poster_image_url,
            'release_date' => $movie?->release_date?->toDateString(),
            'watch_count' => $watchCount,
        ];
    }
}
