<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Episode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Episode Quick View payload (spec §5): one episode's details with this
 * user's watched state, plus previous/next episode ids in airing order
 * (specials excluded) so the quick-view modal can browse through a show.
 *
 * JSON, consumed by the client-side quick-view modal — e.g. opened straight
 * from a Shows › Upcoming row, where the full show payload isn't loaded.
 */
class EpisodeController extends Controller
{
    public function show(Request $request, Episode $episode): JsonResponse
    {
        $watch = $request->user()->episodeWatches()
            ->where('episode_id', $episode->id)
            ->first();

        // Airing-order neighbors within the same show, specials excluded.
        $orderedIds = Episode::query()
            ->where('show_id', $episode->show_id)
            ->where('season_number', '>', 0)
            ->orderBy('season_number')
            ->orderBy('episode_number')
            ->pluck('id')
            ->values()
            ->all();

        $index = array_search($episode->id, $orderedIds, true);
        $previousId = $index !== false && $index > 0 ? $orderedIds[$index - 1] : null;
        $nextId = $index !== false && $index < count($orderedIds) - 1 ? $orderedIds[$index + 1] : null;

        return response()->json([
            'episode' => [
                'id' => $episode->id,
                'season_number' => $episode->season_number,
                'episode_number' => $episode->episode_number,
                'title' => $episode->title,
                'still_url' => $episode->still_image_url,
                'overview' => $episode->overview,
                'air_date' => $episode->air_date?->toDateString(),
                'runtime_minutes' => $episode->runtime_minutes,
            ],
            'show' => [
                'id' => $episode->show_id,
                'title' => $episode->show?->title,
            ],
            'watched' => (bool) $watch?->watched,
            'watchCount' => (int) ($watch->watch_count ?? 0),
            'watchedDate' => $watch?->watched_date?->toDateString(),
            'previousId' => $previousId,
            'nextId' => $nextId,
            // Where this episode sits in the show's run (0-based), for the
            // quick view's position dots.
            'position' => $index === false ? null : $index,
            'total' => count($orderedIds),
        ]);
    }
}
