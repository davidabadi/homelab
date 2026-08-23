<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Movie;
use App\Services\Metadata\Data\SearchResult;
use App\Services\Metadata\MediaMetadataProvider;
use App\Services\Metadata\Tmdb\TmdbException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Movie Detail (spec §5, build item 11): the payload behind the detail modal —
 * poster, release date, About overview, the current user's tracking state,
 * and the movie's franchise siblings (TMDB collection, direct entries only).
 *
 * JSON, not an Inertia page: the detail opens as a client-side modal over
 * whatever screen the user is on, fetched with useHttp. The movie row is
 * shared; tracked/watched are read from this user's own tracking row only.
 */
class MovieController extends Controller
{
    public function __construct(private readonly MediaMetadataProvider $tmdb) {}

    public function show(Request $request, Movie $movie): JsonResponse
    {
        $tracking = $request->user()->movieTrackings()
            ->where('movie_id', $movie->id)
            ->first();

        $tmdbId = $this->tmdbIdFor($movie);

        return response()->json([
            'movie' => [
                'id' => $movie->id,
                'title' => $movie->title,
                'poster_url' => $movie->poster_image_url,
                'overview' => $movie->overview,
                'release_date' => $movie->release_date?->toDateString(),
                'runtime_minutes' => $movie->runtime_minutes,
                'tmdb_id' => $tmdbId,
            ],
            'tracked' => $tracking !== null,
            'watched' => (bool) $tracking?->watched,
            'watchCount' => (int) ($tracking->watch_count ?? 0),
            'watchedDate' => $tracking?->watched_date?->toDateString(),
            'collection' => $this->collectionFor($movie, $tmdbId),
        ]);
    }

    /**
     * The movie's franchise (TMDB collection, spin-offs excluded by TMDB's
     * own membership), INCLUDING the movie itself — the full release-ordered
     * run reads better for franchises whose titles don't number themselves;
     * the client highlights the current entry. Read-through with a day of
     * cache; a TMDB hiccup degrades to null rather than breaking the modal.
     *
     * @return array{name: string, movies: list<array<string, mixed>>}|null
     */
    private function collectionFor(Movie $movie, ?int $selfTmdbId): ?array
    {
        $collectionId = $this->resolveCollectionId($movie, $selfTmdbId);

        if ($collectionId === null) {
            return null;
        }

        try {
            $collection = Cache::remember(
                "tmdb.collection.{$collectionId}",
                now()->addDay(),
                function () use ($collectionId): array {
                    $details = $this->tmdb->fetchMovieCollection($collectionId);

                    return [
                        'name' => $details->name,
                        'movies' => array_map(fn (SearchResult $part): array => [
                            'tmdb_id' => $part->tmdbId,
                            'title' => $part->title,
                            'poster_url' => $this->tmdb->imageUrl($part->posterPath, 'w185'),
                            'year' => $part->year,
                        ], $details->movies),
                    ];
                },
            );
        } catch (TmdbException) {
            return null;
        }

        // A one-movie "franchise" offers nothing to browse.
        if (count($collection['movies']) < 2) {
            return null;
        }

        return $collection;
    }

    /**
     * The movie's collection id, resolving legacy rows lazily: null means the
     * column was never populated (row predates the column), so look it up on
     * TMDB once and persist the answer — the collection id itself, or 0 for
     * "confirmed none" so the lookup never repeats. Returns a usable id or
     * null.
     */
    private function resolveCollectionId(Movie $movie, ?int $tmdbId): ?int
    {
        if ($movie->tmdb_collection_id === null && $tmdbId !== null) {
            try {
                $movie->update([
                    'tmdb_collection_id' => $this->tmdb->fetchMovieDetails($tmdbId)->collectionId ?? 0,
                ]);
            } catch (TmdbException) {
                return null;
            }
        }

        $collectionId = $movie->tmdb_collection_id;

        return $collectionId !== null && $collectionId > 0 ? $collectionId : null;
    }

    /**
     * The TMDB id linked to this movie, so the detail modal can drive the
     * tmdb_id-keyed track endpoint. Null for rows without a TMDB link.
     */
    private function tmdbIdFor(Movie $movie): ?int
    {
        $externalId = $movie->externalIds()->where('provider', 'tmdb')->value('external_id');

        return $externalId !== null ? (int) $externalId : null;
    }
}
