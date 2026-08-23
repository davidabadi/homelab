<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Episode;
use App\Models\Season;
use App\Models\Show;
use App\Models\UserEpisodeWatch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Show Detail (spec §5, build item 11): the payload behind the detail modal —
 * About/Episodes for one shared show, with the current user's watched flags
 * folded onto every episode.
 *
 * JSON, not an Inertia page: the detail opens as a client-side modal over
 * whatever screen the user is on (search, watch list), fetched with useHttp.
 *
 * Specials (season 0) are not considered part of a show and are omitted
 * entirely — from the seasons list, the episodes, and the season count.
 *
 * Per-user isolation: the watch rows are read through
 * $request->user()->episodeWatches(), so another household member's progress
 * never appears here. The show itself (title, seasons, episodes) is shared.
 */
class ShowController extends Controller
{
    public function show(Request $request, Show $show): JsonResponse
    {
        $user = $request->user();

        $episodes = $show->episodes()
            ->where('season_number', '>', 0)
            ->orderBy('season_number')
            ->orderBy('episode_number')
            ->get();

        $watches = $user->episodeWatches()
            ->whereIn('episode_id', $episodes->pluck('id'))
            ->get()
            ->keyBy('episode_id');

        $tracking = $user->showTrackings()->where('show_id', $show->id)->first();

        $episodesBySeason = $episodes->groupBy('season_number');

        $seasons = $show->seasons()
            ->where('season_number', '>', 0)
            ->orderBy('season_number')
            ->get()
            ->map(fn (Season $season): array => [
                'season_number' => $season->season_number,
                'episodes' => ($episodesBySeason->get($season->season_number) ?? collect())
                    ->map(fn (Episode $episode): array => $this->presentEpisode($episode, $watches))
                    ->values()
                    ->all(),
            ]);

        return response()->json([
            'today' => $user->localToday()->toDateString(),
            'show' => [
                'id' => $show->id,
                'title' => $show->title,
                'poster_url' => $show->poster_image_url,
                'overview' => $show->overview,
                'season_count' => $seasons->count(),
                'tmdb_id' => $this->tmdbIdFor($show),
            ],
            'trackingStatus' => $tracking?->status->value,
            'seasons' => $seasons->all(),
        ]);
    }

    /**
     * @param  Collection<int, UserEpisodeWatch>  $watches
     * @return array<string, mixed>
     */
    private function presentEpisode(Episode $episode, Collection $watches): array
    {
        $watch = $watches->get($episode->id);

        return [
            'id' => $episode->id,
            'season_number' => $episode->season_number,
            'episode_number' => $episode->episode_number,
            'title' => $episode->title,
            'still_url' => $episode->still_image_url,
            'overview' => $episode->overview,
            'air_date' => $episode->air_date?->toDateString(),
            'runtime_minutes' => $episode->runtime_minutes,
            'watched' => (bool) $watch?->watched,
            'watch_count' => (int) ($watch->watch_count ?? 0),
            'watched_date' => $watch?->watched_date?->toDateString(),
        ];
    }

    /**
     * The TMDB id linked to this show, so the detail modal can drive the
     * tmdb_id-keyed track endpoint. Null for rows without a TMDB link.
     */
    private function tmdbIdFor(Show $show): ?int
    {
        $externalId = $show->externalIds()->where('provider', 'tmdb')->value('external_id');

        return $externalId !== null ? (int) $externalId : null;
    }
}
