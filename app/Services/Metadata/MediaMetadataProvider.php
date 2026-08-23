<?php

declare(strict_types=1);

namespace App\Services\Metadata;

use App\Services\Metadata\Data\CollectionDetails;
use App\Services\Metadata\Data\MovieDetails;
use App\Services\Metadata\Data\SearchResult;
use App\Services\Metadata\Data\ShowDetails;

/**
 * A read-through metadata provider: it talks to an external catalogue (TMDB
 * today; Trakt may be added later — spec §3) and returns shaped data. It does
 * NOT read from or write to the application database. Finding-or-creating our
 * own Show/Season/Episode/Movie rows happens elsewhere, at track time.
 *
 * Search is a cheap, stateless passthrough. Detail fetches are the only place
 * that pull full season/episode data, and only when explicitly called.
 */
interface MediaMetadataProvider
{
    /**
     * Search both shows and movies in one pass, returning a mixed,
     * lightweight result list for a search-results screen.
     *
     * @return list<SearchResult>
     */
    public function search(string $query): array;

    /**
     * Search shows only.
     *
     * @return list<SearchResult>
     */
    public function searchShows(string $query): array;

    /**
     * Search movies only.
     *
     * @return list<SearchResult>
     */
    public function searchMovies(string $query): array;

    /**
     * Fetch a show's full metadata plus every season's complete episode list.
     * Makes multiple upstream calls (one per season) by design.
     */
    public function fetchShowDetails(int $tmdbId): ShowDetails;

    /**
     * Fetch a movie's full metadata.
     */
    public function fetchMovieDetails(int $tmdbId): MovieDetails;

    public function fetchMovieCollection(int $collectionId): CollectionDetails;

    public function imageUrl(?string $path, string $size = 'w500'): ?string;
}
