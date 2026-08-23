<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\ShowStatus;
use App\Models\Episode;
use App\Models\Movie;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The "Upcoming" screens (spec §5/§6): future episodes/movies for the logged-in
 * user, derived by query — there is no stored upcoming table. An item is
 * upcoming when its air_date / release_date is today or later AND the current
 * user tracks the parent show / the movie.
 *
 * Per-user isolation is enforced in the query itself: the whereHas constrains on
 * the current user's own tracking rows, so one household member's upcoming feed
 * can never surface a title only another member tracks.
 *
 * Both pages receive a `today` prop so the client groups dates by the same
 * calendar cutoff the query used. That cutoff is the current user's own
 * timezone (auto-detected from their browser), so an evening in the US — already
 * past midnight UTC — still reads tomorrow's episode as "Tomorrow", not "Today".
 *
 * Shows › Upcoming also has a "backlog" section above the future feed: episodes
 * that already aired but this user hasn't watched. It is fetched on demand as a
 * cursor-paginated JSON feed ({@see episodeBacklog}), never in the initial page
 * payload — mirroring the Watch List's Watched History. The boundary is exact:
 * future is air_date >= today, backlog is air_date < today, so no episode can
 * appear in both.
 */
class UpcomingController extends Controller
{
    /**
     * Shows › Upcoming: future episodes from shows this user tracks, soonest
     * first, each carrying this user's watched flag — an upcoming episode can
     * legitimately be watched already (seen early via streaming).
     */
    public function episodes(Request $request): Response
    {
        $user = $request->user();
        $today = $user->localToday();

        $episodes = Episode::query()
            ->whereNotNull('air_date')
            ->whereDate('air_date', '>=', $today)
            // Specials (season 0) are not part of a show's tracked run.
            ->where('season_number', '>', 0)
            ->whereHas('show.trackings', function ($query) use ($user): void {
                $query->where('user_id', $user->id)
                    ->where('status', ShowStatus::Watching);
            })
            ->orderBy('air_date')
            ->orderBy('season_number')
            ->orderBy('episode_number')
            ->with('show:id,title,poster_image_url')
            ->get();

        $watchCounts = $user->episodeWatches()
            ->whereIn('episode_id', $episodes->pluck('id'))
            ->where('watched', true)
            ->pluck('watch_count', 'episode_id');

        return Inertia::render('shows/upcoming', [
            'episodes' => $episodes->map(fn (Episode $episode): array => $this->presentEpisode(
                $episode,
                (int) ($watchCounts->get($episode->id) ?? 0),
            ))->values()->all(),
            'today' => $today->toDateString(),
        ]);
    }

    /**
     * Shows › Upcoming backlog: episodes from this user's tracked shows that
     * already aired (air_date strictly before today) and they haven't watched.
     * Cursor-paginated 15 at a time, most-recently-aired first — the client
     * loads it lazily as the user scrolls up above the future feed and prepends
     * older batches, so the newest backlog sits directly against "today".
     *
     * JSON, not Inertia props: like Watched History, this is never part of the
     * page's initial payload. Scoped to the authenticated user throughout.
     */
    public function episodeBacklog(Request $request): JsonResponse
    {
        $user = $request->user();
        $today = $user->localToday();
        $perPage = 15;

        $query = Episode::query()
            ->whereNotNull('air_date')
            // Strictly before today: the exact complement of the future feed's
            // air_date >= today, so nothing appears in both sections.
            ->whereDate('air_date', '<', $today)
            // Specials (season 0) are not part of a show's tracked run.
            ->where('season_number', '>', 0)
            ->whereHas('show.trackings', function ($query) use ($user): void {
                $query->where('user_id', $user->id)
                    ->where('status', ShowStatus::Watching);
            })
            // Backlog is unwatched by definition — an episode this user has
            // already marked watched drops out.
            ->whereDoesntHave('watches', function ($query) use ($user): void {
                $query->where('user_id', $user->id)->where('watched', true);
            })
            ->orderByDesc('air_date')
            ->orderByDesc('id')
            ->with('show:id,title,poster_image_url');

        // Keyset cursor "<air_date>,<id>": everything strictly older than the
        // last row of the previous page, ties on the same air_date broken by id
        // so a same-day batch (e.g. a season binge-drop) pages deterministically.
        $cursor = $request->query('cursor');

        if (is_string($cursor) && str_contains($cursor, ',')) {
            [$date, $id] = explode(',', $cursor, 2);
            $airDate = Carbon::parse($date)->toDateString();
            $lastId = (int) $id;

            $query->where(function ($query) use ($airDate, $lastId): void {
                $query->whereDate('air_date', '<', $airDate)
                    ->orWhere(function ($query) use ($airDate, $lastId): void {
                        $query->whereDate('air_date', $airDate)
                            ->where('id', '<', $lastId);
                    });
            });
        }

        $episodes = $query->limit($perPage + 1)->get();
        $hasMore = $episodes->count() > $perPage;
        $episodes = $episodes->take($perPage);

        $last = $episodes->last();
        $nextCursor = $hasMore && $last !== null
            ? $last->air_date->toDateString().','.$last->id
            : null;

        return response()->json([
            // Most-recently-aired first; the client reverses each batch for its
            // oldest-at-top, newest-adjacent-to-the-future-feed layout.
            'rows' => $episodes->map(fn (Episode $episode): array => $this->presentEpisode($episode, 0))->all(),
            'nextCursor' => $nextCursor,
            'hasMore' => $hasMore,
        ]);
    }

    /**
     * The shared Upcoming episode row shape (future feed + backlog).
     *
     * @return array<string, mixed>
     */
    private function presentEpisode(Episode $episode, int $watchCount): array
    {
        return [
            'id' => $episode->id,
            'show_id' => $episode->show_id,
            'show_title' => $episode->show?->title,
            'show_poster_url' => $episode->show?->poster_image_url,
            'season_number' => $episode->season_number,
            'episode_number' => $episode->episode_number,
            'title' => $episode->title,
            'air_date' => $episode->air_date?->toDateString(),
            'watch_count' => $watchCount,
        ];
    }

    /**
     * Movies › Upcoming: future movies this user tracks, soonest first, with a
     * server-computed day countdown (spec §5: title + "X days").
     */
    public function movies(Request $request): Response
    {
        $user = $request->user();
        $today = $user->localToday();

        $movies = Movie::query()
            ->whereNotNull('release_date')
            ->whereDate('release_date', '>=', $today)
            ->whereHas('trackings', function ($query) use ($user): void {
                $query->where('user_id', $user->id);
            })
            ->orderBy('release_date')
            ->get();

        return Inertia::render('movies/upcoming', [
            'movies' => $movies->map(fn (Movie $movie): array => [
                'id' => $movie->id,
                'title' => $movie->title,
                'poster_url' => $movie->poster_image_url,
                'release_date' => $movie->release_date?->toDateString(),
                'days_until' => (int) $today->diffInDays($movie->release_date),
            ])->values()->all(),
            'today' => $today->toDateString(),
        ]);
    }
}
