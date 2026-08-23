<?php

declare(strict_types=1);

namespace App\Services\Metadata\Data;

/**
 * A TMDB collection ("franchise"): its display name plus the member movies as
 * lightweight search hits. Members are the collection's direct entries only —
 * spin-offs live outside the collection on TMDB's side.
 */
final readonly class CollectionDetails
{
    /**
     * @param  list<SearchResult>  $movies
     */
    public function __construct(
        public int $tmdbId,
        public string $name,
        public array $movies,
    ) {}
}
