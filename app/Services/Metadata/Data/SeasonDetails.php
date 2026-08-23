<?php

declare(strict_types=1);

namespace App\Services\Metadata\Data;

/**
 * A season and its full episode list. Maps onto the `seasons` table
 * (season_number, episode_count) with the episodes belonging to the show.
 *
 * `episodeCount` is derived from the actual episodes returned by TMDB's
 * per-season endpoint, so it stays consistent with $episodes.
 */
final readonly class SeasonDetails
{
    /**
     * @param  list<EpisodeDetails>  $episodes
     */
    public function __construct(
        public int $seasonNumber,
        public int $episodeCount,
        public array $episodes,
    ) {}
}
