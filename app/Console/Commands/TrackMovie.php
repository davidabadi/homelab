<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Library\MediaLibraryService;
use Illuminate\Console\Command;

/**
 * Live end-to-end check for movie tracking + the watched toggle (spec §10 item
 * 5) against the real TMDB API, as a given user. Mirrors TrackShow.
 *
 *   php artisan app:track-movie 603 --user=david@abadi.org
 *   php artisan app:track-movie 603 --user=david@abadi.org --toggle
 */
class TrackMovie extends Command
{
    protected $signature = 'app:track-movie
                            {tmdb : TMDB movie id}
                            {--user= : Email of the user to track as (defaults to the first user)}
                            {--toggle : Also toggle the watched state after tracking}';

    protected $description = 'Track a TMDB movie as a given user (find-or-create), optionally toggling watched';

    public function handle(MediaLibraryService $library): int
    {
        $user = $this->resolveUser($this->option('user'));

        if ($user === null) {
            return self::FAILURE;
        }

        $tmdbId = (int) $this->argument('tmdb');

        $this->info("Finding-or-creating movie for TMDB #{$tmdbId}...");
        $movie = $library->findOrCreateMovie($tmdbId);

        $tracking = $user->movieTrackings()->firstOrCreate(['movie_id' => $movie->id]);

        $verb = $movie->wasRecentlyCreated ? 'Created' : 'Reused existing';
        $this->line("{$verb} movie #{$movie->id}: {$movie->title}");
        $this->line('  release: '.($movie->release_date?->toDateString() ?? '(none)'));
        $this->line('  runtime: '.($movie->runtime_minutes ?? '(none)').'m');

        if ($this->option('toggle')) {
            $tracking->setWatchCount($tracking->watched ? 0 : 1);
            $tracking->save();
        }

        $this->newLine();
        $this->info(sprintf(
            'Tracking for %s: watched=%s watched_date=%s (row #%d)',
            $user->email,
            $tracking->watched ? 'true' : 'false',
            $tracking->watched_date?->toIso8601String() ?? '(null)',
            $tracking->id,
        ));

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
}
