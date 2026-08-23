<?php

declare(strict_types=1);

namespace App\Services\Metadata\Data;

/**
 * One episode's metadata, shaped to map onto the `episodes` table
 * (title, still_image_url, overview, air_date, runtime_minutes).
 *
 * `stillPath` is the raw TMDB path; build a full URL with
 * TmdbService::imageUrl(). `airDate` is a 'Y-m-d' string or null when TMDB
 * has no confirmed date yet.
 */
final readonly class EpisodeDetails
{
    public function __construct(
        public int $seasonNumber,
        public int $episodeNumber,
        public ?string $title,
        public ?string $stillPath,
        public ?string $overview,
        public ?string $airDate,
        public ?int $runtimeMinutes,
    ) {}
}
