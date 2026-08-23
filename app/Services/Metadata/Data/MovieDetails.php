<?php

declare(strict_types=1);

namespace App\Services\Metadata\Data;

/**
 * A movie's full metadata, shaped to map onto the `movies` table
 * (title, poster_image_url, overview, release_date, runtime_minutes).
 *
 * `posterPath` is the raw TMDB path; build a full URL with
 * TmdbService::imageUrl(). `releaseDate` is a 'Y-m-d' string or null.
 */
final readonly class MovieDetails
{
    /**
     * `collectionId` is the TMDB collection ("franchise") the movie belongs
     * to — direct entries only (Star Wars Episodes 1–9 share one; spin-offs
     * do not) — or null for standalone movies.
     */
    public function __construct(
        public int $tmdbId,
        public string $title,
        public ?string $posterPath,
        public ?string $overview,
        public ?string $releaseDate,
        public ?int $runtimeMinutes,
        public ?int $collectionId,
    ) {}
}
