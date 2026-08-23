<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Console\Commands\RefreshTrackedMedia;
use App\Models\Movie;
use App\Services\Library\MediaLibraryService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Refresh one tracked movie's release_date/runtime from TMDB (spec §6).
 * Dispatched one-per-movie by the nightly
 * {@see RefreshTrackedMedia} command, and only for movies
 * still missing a confirmed release date or runtime — so each queued call does
 * real work and a failure on one movie doesn't block the others.
 */
class RefreshMovieMetadata implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly Movie $movie,
    ) {}

    public function handle(MediaLibraryService $library): void
    {
        $library->refreshMovie($this->movie);
    }
}
