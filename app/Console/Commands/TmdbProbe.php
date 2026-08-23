<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Metadata\Data\SearchResult;
use App\Services\Metadata\Tmdb\TmdbService;
use Illuminate\Console\Command;

/**
 * Manual smoke test for the TMDB provider (spec §10, item 4). Exercises
 * search + detail fetch and prints the shaped results so you can eyeball
 * real TMDB data before anything is built on top of it.
 *
 * This command performs NO database access — it only calls TmdbService, which
 * is a pure read-through client. Nothing lands in the DB from running it.
 *
 *   php artisan app:tmdb-probe "Rick and Morty"
 *   php artisan app:tmdb-probe "The Matrix" --movie
 */
class TmdbProbe extends Command
{
    protected $signature = 'app:tmdb-probe
                            {query=Rick and Morty : Title to search for}
                            {--movie : Probe the movie path instead of the show path}';

    protected $description = 'Smoke-test the TMDB provider service (read-only, no DB writes)';

    public function handle(TmdbService $tmdb): int
    {
        $query = (string) $this->argument('query');

        return $this->option('movie')
            ? $this->probeMovie($tmdb, $query)
            : $this->probeShow($tmdb, $query);
    }

    private function probeShow(TmdbService $tmdb, string $query): int
    {
        $this->info("Searching shows for \"{$query}\"...");
        $results = $tmdb->searchShows($query);
        $this->renderResults($results);

        if ($results === []) {
            $this->warn('No results — nothing to fetch details for.');

            return self::SUCCESS;
        }

        $top = $results[0];
        $this->newLine();
        $this->info("Fetching full details for #{$top->tmdbId} \"{$top->title}\" (one call per season)...");

        $show = $tmdb->fetchShowDetails($top->tmdbId);

        $totalEpisodes = array_sum(array_map(fn ($s): int => $s->episodeCount, $show->seasons));
        $this->line("Title:      {$show->title}");
        $this->line('Poster:     '.($tmdb->imageUrl($show->posterPath) ?? '(none)'));
        $this->line('Backdrop:   '.($tmdb->imageUrl($show->backdropPath, 'original') ?? '(none)'));
        $this->line('Seasons:    '.count($show->seasons)." ({$totalEpisodes} episodes total)");

        $this->table(
            ['Season', 'Episodes'],
            array_map(fn ($s): array => ["S{$s->seasonNumber}", $s->episodeCount], $show->seasons),
        );

        // Show a sample episode so runtime / still / air date are visible.
        foreach ($show->seasons as $season) {
            if ($season->episodes !== []) {
                $ep = $season->episodes[0];
                $this->newLine();
                $this->line("Sample episode — S{$ep->seasonNumber}E{$ep->episodeNumber}: {$ep->title}");
                $this->line('  air_date: '.($ep->airDate ?? '(none)')
                    .'  runtime: '.($ep->runtimeMinutes ?? '(none)').'m');
                $this->line('  still:    '.($tmdb->imageUrl($ep->stillPath) ?? '(none)'));
                break;
            }
        }

        return self::SUCCESS;
    }

    private function probeMovie(TmdbService $tmdb, string $query): int
    {
        $this->info("Searching movies for \"{$query}\"...");
        $results = $tmdb->searchMovies($query);
        $this->renderResults($results);

        if ($results === []) {
            $this->warn('No results — nothing to fetch details for.');

            return self::SUCCESS;
        }

        $top = $results[0];
        $this->newLine();
        $this->info("Fetching full details for #{$top->tmdbId} \"{$top->title}\"...");

        $movie = $tmdb->fetchMovieDetails($top->tmdbId);
        $this->line("Title:    {$movie->title}");
        $this->line('Released: '.($movie->releaseDate ?? '(none)'));
        $this->line('Runtime:  '.($movie->runtimeMinutes ?? '(none)').'m');
        $this->line('Poster:   '.($tmdb->imageUrl($movie->posterPath) ?? '(none)'));
        $this->line('Overview: '.mb_strimwidth((string) $movie->overview, 0, 120, '…'));

        return self::SUCCESS;
    }

    /**
     * @param  list<SearchResult>  $results
     */
    private function renderResults(array $results): void
    {
        $this->table(
            ['TMDB ID', 'Type', 'Title', 'Year'],
            array_map(fn (SearchResult $r): array => [
                $r->tmdbId,
                $r->mediaType->value,
                $r->title,
                $r->year ?? '—',
            ], array_slice($results, 0, 10)),
        );
    }
}
