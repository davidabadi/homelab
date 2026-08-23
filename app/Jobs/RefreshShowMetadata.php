<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Console\Commands\RefreshTrackedMedia;
use App\Models\Show;
use App\Services\Library\MediaLibraryService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Refresh one tracked show's season/episode list from TMDB (spec §6). Dispatched
 * one-per-show by the nightly {@see RefreshTrackedMedia}
 * command so a failure or slow TMDB call on one show never blocks the rest — each
 * runs independently through the queue worker.
 */
class RefreshShowMetadata implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly Show $show,
    ) {}

    public function handle(MediaLibraryService $library): void
    {
        $library->refreshShow($this->show);
    }
}
