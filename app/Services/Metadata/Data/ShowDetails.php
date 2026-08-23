<?php

declare(strict_types=1);

namespace App\Services\Metadata\Data;

/**
 * A show's full metadata plus every season's complete episode list. Building
 * this makes one TMDB call for the show and one per season, so it is only
 * ever produced by an explicit fetchShowDetails() — never during search.
 *
 * `posterPath`/`backdropPath` are raw TMDB paths; build full URLs with
 * TmdbService::imageUrl(). (`backdropPath` has no column yet, but the Show
 * Detail header uses a backdrop — spec §5 — so it is surfaced here.)
 */
final readonly class ShowDetails
{
    /**
     * `ended` is true when TMDB reports the show as concluded ("Ended" or
     * "Canceled") — no further episodes expected unless it is later revived.
     *
     * @param  list<SeasonDetails>  $seasons
     */
    public function __construct(
        public int $tmdbId,
        public string $title,
        public ?string $posterPath,
        public ?string $backdropPath,
        public ?string $overview,
        public bool $ended,
        public array $seasons,
    ) {}
}
