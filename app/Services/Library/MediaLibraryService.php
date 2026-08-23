<?php

declare(strict_types=1);

namespace App\Services\Library;

use App\Models\Episode;
use App\Models\MediaExternalId;
use App\Models\Movie;
use App\Models\Season;
use App\Models\Show;
use App\Services\Metadata\Data\MediaType;
use App\Services\Metadata\Data\ShowDetails;
use App\Services\Metadata\Tmdb\TmdbService;
use Illuminate\Support\Facades\DB;

/**
 * Turns a provider (TMDB) id into a persisted, shared Show/Movie row — the
 * find-or-create + full season/episode pull that was deliberately deferred out
 * of the TMDB session and belongs here, at track time (spec §4/§10 item 5).
 *
 * "Find" is a cheap lookup through media_external_ids; the household never
 * re-fetches metadata it already has. "Create" is the expensive path (one TMDB
 * call per season for shows) and only runs the first time a title is tracked.
 *
 * This layer knows how to map provider DTOs onto our own rows, so it depends on
 * the concrete TmdbService: it needs imageUrl() to turn raw poster/still paths
 * into the full URLs our columns store, which is TMDB-specific and not part of
 * the read-through provider interface.
 */
final readonly class MediaLibraryService
{
    private const PROVIDER = 'tmdb';

    public function __construct(
        private TmdbService $tmdb,
        private TrackingStatusService $trackingStatus,
    ) {}

    /**
     * Find our Show for this TMDB id, or create it (plus every season and
     * episode) by pulling full details from TMDB. Idempotent: a title already
     * in the library is returned as-is, with no second fetch and no duplicate.
     */
    public function findOrCreateShow(int $tmdbId): Show
    {
        $existing = $this->existingMedia(MediaType::Show, $tmdbId);

        if ($existing instanceof Show) {
            return $existing;
        }

        $details = $this->tmdb->fetchShowDetails($tmdbId);

        return DB::transaction(fn (): Show => $this->persistShow($details));
    }

    /**
     * Re-pull a show's full season/episode list from TMDB and reconcile it into
     * our own tables (spec §6, nightly refresh). Unlike findOrCreateShow(), this
     * always fetches: it upserts every season by (show_id, season_number) and
     * every episode by (show_id, season_number, episode_number) — refreshing
     * air_date/runtime and picking up any newly-added episodes or seasons. A show
     * with no TMDB link is skipped (nothing to refresh against).
     */
    public function refreshShow(Show $show): void
    {
        $tmdbId = $this->tmdbIdFor(MediaType::Show, $show->id);

        if ($tmdbId === null) {
            return;
        }

        $details = $this->tmdb->fetchShowDetails($tmdbId);

        DB::transaction(function () use ($show, $details): void {
            // Keep the concluded flag fresh: an ended show can be revived with
            // new seasons, and a running one can get canceled.
            $show->update(['ended' => $details->ended]);

            foreach ($details->seasons as $season) {
                $show->seasons()->updateOrCreate(
                    ['season_number' => $season->seasonNumber],
                    ['episode_count' => $season->episodeCount],
                );

                foreach ($season->episodes as $episode) {
                    $show->episodes()->updateOrCreate(
                        [
                            'season_number' => $episode->seasonNumber,
                            'episode_number' => $episode->episodeNumber,
                        ],
                        [
                            'title' => $episode->title,
                            'still_image_url' => $this->tmdb->imageUrl($episode->stillPath),
                            'overview' => $episode->overview,
                            'air_date' => $episode->airDate,
                            'runtime_minutes' => $episode->runtimeMinutes,
                        ],
                    );
                }
            }
        });

        // With metadata reconciled, derive statuses: anyone still "watching" a
        // now-concluded show they have fully seen becomes "finished". Covers
        // the finale being watched before TMDB flagged the show as Ended.
        $this->trackingStatus->finishCompletedTrackings($show->refresh());
    }

    /**
     * Refresh a movie's release_date/runtime from TMDB (spec §6). Only ever
     * called for movies still missing one of those values; a fetched value never
     * overwrites a confirmed one with an empty placeholder, so a movie converges
     * on confirmed data and then stops qualifying for refresh. TMDB reports an
     * unknown runtime as 0 (not null) for unreleased films, so a 0 is treated as
     * "not yet confirmed" — never written over a real runtime, and never taken as
     * confirmation. A movie with no TMDB link is skipped.
     */
    public function refreshMovie(Movie $movie): void
    {
        $tmdbId = $this->tmdbIdFor(MediaType::Movie, $movie->id);

        if ($tmdbId === null) {
            return;
        }

        $details = $this->tmdb->fetchMovieDetails($tmdbId);

        $runtime = ($details->runtimeMinutes !== null && $details->runtimeMinutes > 0)
            ? $details->runtimeMinutes
            : $movie->runtime_minutes;

        $movie->update([
            'release_date' => $details->releaseDate ?? $movie->release_date,
            'runtime_minutes' => $runtime,
            // 0 = confirmed collection-less (null means "never checked").
            'tmdb_collection_id' => $details->collectionId ?? 0,
        ]);
    }

    /**
     * Find our Movie for this TMDB id, or create it by pulling full details
     * from TMDB. Idempotent, like findOrCreateShow().
     */
    public function findOrCreateMovie(int $tmdbId): Movie
    {
        $existing = $this->existingMedia(MediaType::Movie, $tmdbId);

        if ($existing instanceof Movie) {
            return $existing;
        }

        $details = $this->tmdb->fetchMovieDetails($tmdbId);

        return DB::transaction(function () use ($details): Movie {
            $movie = Movie::create([
                'title' => $details->title,
                'poster_image_url' => $this->tmdb->imageUrl($details->posterPath),
                'overview' => $details->overview,
                'release_date' => $details->releaseDate,
                'runtime_minutes' => $details->runtimeMinutes,
                // 0 = confirmed collection-less (null means "never checked").
                'tmdb_collection_id' => $details->collectionId ?? 0,
            ]);

            $this->linkExternalId(MediaType::Movie, $movie->id, $details->tmdbId);

            return $movie;
        });
    }

    private function persistShow(ShowDetails $details): Show
    {
        $show = Show::create([
            'title' => $details->title,
            'poster_image_url' => $this->tmdb->imageUrl($details->posterPath),
            'overview' => $details->overview,
            'ended' => $details->ended,
        ]);

        foreach ($details->seasons as $season) {
            Season::create([
                'show_id' => $show->id,
                'season_number' => $season->seasonNumber,
                'episode_count' => $season->episodeCount,
            ]);

            foreach ($season->episodes as $episode) {
                Episode::create([
                    'show_id' => $show->id,
                    'season_number' => $episode->seasonNumber,
                    'episode_number' => $episode->episodeNumber,
                    'title' => $episode->title,
                    'still_image_url' => $this->tmdb->imageUrl($episode->stillPath),
                    'overview' => $episode->overview,
                    'air_date' => $episode->airDate,
                    'runtime_minutes' => $episode->runtimeMinutes,
                ]);
            }
        }

        $this->linkExternalId(MediaType::Show, $show->id, $details->tmdbId);

        return $show;
    }

    /**
     * Resolve an existing Show/Movie via its TMDB external id, or null if the
     * household has never tracked this title before.
     */
    private function existingMedia(MediaType $type, int $tmdbId): Show|Movie|null
    {
        $link = MediaExternalId::query()
            ->where('provider', self::PROVIDER)
            ->where('media_type', $type->value)
            ->where('external_id', (string) $tmdbId)
            ->first();

        if ($link === null) {
            return null;
        }

        return match ($type) {
            MediaType::Show => Show::find($link->media_id),
            MediaType::Movie => Movie::find($link->media_id),
        };
    }

    /**
     * Resolve the TMDB external id recorded for an existing Show/Movie row, or
     * null if the household has no TMDB link for it (nothing to refresh against).
     */
    private function tmdbIdFor(MediaType $type, int $mediaId): ?int
    {
        $link = MediaExternalId::query()
            ->where('provider', self::PROVIDER)
            ->where('media_type', $type->value)
            ->where('media_id', $mediaId)
            ->first();

        return $link !== null ? (int) $link->external_id : null;
    }

    private function linkExternalId(MediaType $type, int $mediaId, int $tmdbId): void
    {
        MediaExternalId::create([
            'media_type' => $type->value,
            'media_id' => $mediaId,
            'provider' => self::PROVIDER,
            'external_id' => (string) $tmdbId,
        ]);
    }
}
