<?php

declare(strict_types=1);

namespace App\Services\Metadata\Tmdb;

use App\Services\Metadata\Data\CollectionDetails;
use App\Services\Metadata\Data\EpisodeDetails;
use App\Services\Metadata\Data\MediaType;
use App\Services\Metadata\Data\MovieDetails;
use App\Services\Metadata\Data\SearchResult;
use App\Services\Metadata\Data\SeasonDetails;
use App\Services\Metadata\Data\ShowDetails;
use App\Services\Metadata\MediaMetadataProvider;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * Read-through TMDB client (spec §3). Every method makes HTTP calls to TMDB
 * and returns shaped DTOs; nothing here touches the application database.
 *
 * Uses TMDB's v3 REST API with a query-string api_key. Bound in
 * AppServiceProvider from config('services.tmdb').
 */
final class TmdbService implements MediaMetadataProvider
{
    public function __construct(
        private readonly string $apiKey,
        private readonly string $baseUrl = 'https://api.themoviedb.org/3',
        private readonly string $imageBaseUrl = 'https://image.tmdb.org/t/p',
    ) {}

    public function search(string $query): array
    {
        $results = [];

        foreach ($this->get('/search/multi', ['query' => $query])['results'] ?? [] as $row) {
            $result = match ($row['media_type'] ?? null) {
                'tv' => $this->toShowResult($row),
                'movie' => $this->toMovieResult($row),
                default => null, // ignore people and anything else
            };

            if ($result !== null) {
                $results[] = $result;
            }
        }

        return $results;
    }

    public function searchShows(string $query): array
    {
        return array_values(array_map(
            fn (array $row): SearchResult => $this->toShowResult($row),
            $this->get('/search/tv', ['query' => $query])['results'] ?? [],
        ));
    }

    public function searchMovies(string $query): array
    {
        return array_values(array_map(
            fn (array $row): SearchResult => $this->toMovieResult($row),
            $this->get('/search/movie', ['query' => $query])['results'] ?? [],
        ));
    }

    public function fetchShowDetails(int $tmdbId): ShowDetails
    {
        $show = $this->get("/tv/{$tmdbId}");

        // One call per season — this is the expensive path, only ever reached
        // through an explicit fetchShowDetails(), never during search.
        $seasons = [];
        foreach ($show['seasons'] ?? [] as $season) {
            $seasons[] = $this->fetchSeason($tmdbId, (int) $season['season_number']);
        }

        return new ShowDetails(
            tmdbId: (int) $show['id'],
            title: (string) ($show['name'] ?? ''),
            posterPath: $show['poster_path'] ?? null,
            backdropPath: $show['backdrop_path'] ?? null,
            overview: $show['overview'] ?? null,
            // TMDB's status field: "Returning Series", "In Production",
            // "Ended", "Canceled", ... — only the last two mean concluded.
            ended: in_array($show['status'] ?? '', ['Ended', 'Canceled'], true),
            seasons: $seasons,
        );
    }

    public function fetchMovieDetails(int $tmdbId): MovieDetails
    {
        $movie = $this->get("/movie/{$tmdbId}");

        return new MovieDetails(
            tmdbId: (int) $movie['id'],
            title: (string) ($movie['title'] ?? ''),
            posterPath: $movie['poster_path'] ?? null,
            overview: $movie['overview'] ?? null,
            releaseDate: $this->nullableString($movie['release_date'] ?? null),
            runtimeMinutes: isset($movie['runtime']) ? (int) $movie['runtime'] : null,
            collectionId: isset($movie['belongs_to_collection']['id'])
                ? (int) $movie['belongs_to_collection']['id']
                : null,
        );
    }

    /**
     * Fetch a TMDB collection ("franchise") and its member movies, ordered by
     * release date (unknown dates last). TMDB collections hold the direct
     * entries only, which is exactly the "no spin-offs" semantics the movie
     * detail's franchise strip wants.
     */
    public function fetchMovieCollection(int $collectionId): CollectionDetails
    {
        $collection = $this->get("/collection/{$collectionId}");

        $movies = array_map(
            fn (array $part): SearchResult => $this->toMovieResult($part),
            $collection['parts'] ?? [],
        );

        usort($movies, function (SearchResult $a, SearchResult $b): int {
            return ($a->year ?? PHP_INT_MAX) <=> ($b->year ?? PHP_INT_MAX);
        });

        return new CollectionDetails(
            tmdbId: (int) $collection['id'],
            name: (string) ($collection['name'] ?? ''),
            movies: $movies,
        );
    }

    /**
     * Build a full image URL from a raw TMDB path (e.g. "/abc.jpg"), or null
     * if the path is empty. Sizes are TMDB's named buckets, e.g. "w500",
     * "original". This is where next session gets the values it stores in
     * poster_image_url / still_image_url.
     */
    public function imageUrl(?string $path, string $size = 'w500'): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }

        return rtrim($this->imageBaseUrl, '/').'/'.$size.'/'.ltrim($path, '/');
    }

    private function fetchSeason(int $showId, int $seasonNumber): SeasonDetails
    {
        $data = $this->get("/tv/{$showId}/season/{$seasonNumber}");

        $episodes = array_map(
            fn (array $episode): EpisodeDetails => new EpisodeDetails(
                seasonNumber: (int) ($episode['season_number'] ?? $seasonNumber),
                episodeNumber: (int) $episode['episode_number'],
                title: $episode['name'] ?? null,
                stillPath: $episode['still_path'] ?? null,
                overview: $this->nullableString($episode['overview'] ?? null),
                airDate: $this->nullableString($episode['air_date'] ?? null),
                runtimeMinutes: isset($episode['runtime']) ? (int) $episode['runtime'] : null,
            ),
            $data['episodes'] ?? [],
        );

        return new SeasonDetails(
            seasonNumber: $seasonNumber,
            episodeCount: count($episodes),
            episodes: array_values($episodes),
        );
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function toShowResult(array $row): SearchResult
    {
        return new SearchResult(
            tmdbId: (int) $row['id'],
            mediaType: MediaType::Show,
            title: (string) ($row['name'] ?? ''),
            posterPath: $row['poster_path'] ?? null,
            year: $this->yearFrom($row['first_air_date'] ?? null),
        );
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function toMovieResult(array $row): SearchResult
    {
        return new SearchResult(
            tmdbId: (int) $row['id'],
            mediaType: MediaType::Movie,
            title: (string) ($row['title'] ?? ''),
            posterPath: $row['poster_path'] ?? null,
            year: $this->yearFrom($row['release_date'] ?? null),
        );
    }

    /**
     * Issue a GET against TMDB and return the decoded JSON body.
     *
     * @param  array<string, mixed>  $query
     * @return array<mixed>
     */
    private function get(string $path, array $query = []): array
    {
        try {
            $response = $this->client()->get(ltrim($path, '/'), $query);
        } catch (ConnectionException $e) {
            throw new TmdbException("Could not reach TMDB for [{$path}]: {$e->getMessage()}", previous: $e);
        }

        if ($response->failed()) {
            throw new TmdbException(
                "TMDB request to [{$path}] failed with status {$response->status()}."
            );
        }

        return $response->json() ?? [];
    }

    private function client(): PendingRequest
    {
        if ($this->apiKey === '') {
            throw new TmdbException('TMDB_API_KEY is not set. Add it to your .env.');
        }

        return Http::baseUrl($this->baseUrl)
            ->acceptJson()
            ->withQueryParameters(['api_key' => $this->apiKey])
            ->timeout(10)
            ->retry(2, 250, throw: false);
    }

    private function yearFrom(?string $date): ?int
    {
        if ($date === null || strlen($date) < 4) {
            return null;
        }

        return (int) substr($date, 0, 4);
    }

    private function nullableString(?string $value): ?string
    {
        return ($value === null || $value === '') ? null : $value;
    }
}
