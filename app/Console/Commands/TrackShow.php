<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\ShowStatus;
use App\Models\User;
use App\Services\Library\MediaLibraryService;
use Illuminate\Console\Command;

/**
 * Live end-to-end check for show tracking (spec §10 item 5) against the real
 * TMDB API — the thing feature tests (which fake TMDB) can't prove: that a
 * brand-new show pulls its full season/episode data correctly and lands in our
 * own tables.
 *
 * Runs the exact same MediaLibraryservice + tracking path the HTTP controller
 * uses, but as a given user without needing a browser session or CSRF token.
 *
 *   php artisan app:track-show 1399 --user=david@abadi.org
 *   php artisan app:track-show 1399 --user=david@abadi.org --status=watching
 */
class TrackShow extends Command
{
    protected $signature = 'app:track-show
                            {tmdb : TMDB show id}
                            {--user= : Email of the user to track as (defaults to the first user)}
                            {--status= : watching|watch_later|finished|stopped (default watch_later)}';

    protected $description = 'Track a TMDB show as a given user (find-or-create + full season/episode pull)';

    public function handle(MediaLibraryService $library): int
    {
        $user = $this->resolveUser($this->option('user'));

        if ($user === null) {
            return self::FAILURE;
        }

        $status = $this->resolveStatus($this->option('status'));

        if ($status === false) {
            return self::FAILURE;
        }

        $tmdbId = (int) $this->argument('tmdb');

        $this->info("Finding-or-creating show for TMDB #{$tmdbId} (may pull all seasons)...");
        $show = $library->findOrCreateShow($tmdbId);

        $tracking = $user->showTrackings()->updateOrCreate(
            ['show_id' => $show->id],
            ['status' => $status],
        );

        $verb = $show->wasRecentlyCreated ? 'Created' : 'Reused existing';
        $this->line("{$verb} show #{$show->id}: {$show->title}");
        $this->line('  seasons:  '.$show->seasons()->count());
        $this->line('  episodes: '.$show->episodes()->count());
        $this->newLine();
        $this->info("Tracking for {$user->email}: status={$tracking->status->value} (row #{$tracking->id})");

        return self::SUCCESS;
    }

    private function resolveUser(?string $email): ?User
    {
        $user = $email !== null
            ? User::where('email', $email)->first()
            : User::orderBy('id')->first();

        if ($user === null) {
            $this->error($email !== null ? "No user with email {$email}." : 'No users exist yet.');
        }

        return $user;
    }

    private function resolveStatus(?string $status): ShowStatus|false
    {
        if ($status === null || $status === '') {
            return ShowStatus::WatchLater;
        }

        $resolved = ShowStatus::tryFrom($status);

        if ($resolved === null) {
            $this->error("Invalid status '{$status}'. Use: watching, watch_later, finished, stopped.");

            return false;
        }

        return $resolved;
    }
}
