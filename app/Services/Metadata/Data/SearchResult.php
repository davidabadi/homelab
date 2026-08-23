<?php

declare(strict_types=1);

namespace App\Services\Metadata\Data;

/**
 * A single lightweight search hit, suitable for a search-results screen.
 * Deliberately shallow: no seasons, episodes, or runtimes — those are only
 * fetched via fetchShowDetails()/fetchMovieDetails() once a title is opened.
 *
 * `posterPath` is the raw TMDB path (e.g. "/abc.jpg"); build a full URL with
 * TmdbService::imageUrl().
 */
final readonly class SearchResult
{
    public function __construct(
        public int $tmdbId,
        public MediaType $mediaType,
        public string $title,
        public ?string $posterPath,
        public ?int $year,
    ) {}
}
