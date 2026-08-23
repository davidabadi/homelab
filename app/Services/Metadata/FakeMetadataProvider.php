<?php

declare(strict_types=1);

namespace App\Services\Metadata;

use App\Services\Metadata\Data\CollectionDetails;
use App\Services\Metadata\Data\EpisodeDetails;
use App\Services\Metadata\Data\MediaType;
use App\Services\Metadata\Data\MovieDetails;
use App\Services\Metadata\Data\SearchResult;
use App\Services\Metadata\Data\SeasonDetails;
use App\Services\Metadata\Data\ShowDetails;

final class FakeMetadataProvider implements MediaMetadataProvider
{
    public function search(string $query): array
    {
        return [
            new SearchResult(91001, MediaType::Show, 'E2E Search Show', null, 2024),
            new SearchResult(92001, MediaType::Movie, 'E2E Search Movie', null, 2025),
        ];
    }

    public function searchShows(string $query): array
    {
        return array_values(array_filter(
            $this->search($query),
            fn (SearchResult $result): bool => $result->mediaType === MediaType::Show,
        ));
    }

    public function searchMovies(string $query): array
    {
        return array_values(array_filter(
            $this->search($query),
            fn (SearchResult $result): bool => $result->mediaType === MediaType::Movie,
        ));
    }

    public function fetchShowDetails(int $tmdbId): ShowDetails
    {
        $episodes = [
            new EpisodeDetails(1, 1, 'The Deterministic Beginning', null, 'A stable first episode.', '2024-01-01', 42),
            new EpisodeDetails(1, 2, 'The Deterministic Return', null, 'A stable second episode.', '2024-01-08', 44),
        ];

        return new ShowDetails(
            tmdbId: $tmdbId,
            title: $tmdbId === 91001 ? 'E2E Search Show' : "Imported Show {$tmdbId}",
            posterPath: null,
            backdropPath: null,
            overview: 'Deterministic E2E metadata with no external network dependency.',
            ended: false,
            seasons: [new SeasonDetails(1, count($episodes), $episodes)],
        );
    }

    public function fetchMovieDetails(int $tmdbId): MovieDetails
    {
        return new MovieDetails(
            tmdbId: $tmdbId,
            title: $tmdbId === 92001 ? 'E2E Search Movie' : "Imported Movie {$tmdbId}",
            posterPath: null,
            overview: 'Deterministic E2E movie metadata.',
            releaseDate: '2025-01-01',
            runtimeMinutes: 101,
            collectionId: $tmdbId === 92001 ? 93001 : null,
        );
    }

    public function fetchMovieCollection(int $collectionId): CollectionDetails
    {
        return new CollectionDetails($collectionId, 'E2E Collection', [
            new SearchResult(92001, MediaType::Movie, 'E2E Search Movie', null, 2025),
            new SearchResult(92002, MediaType::Movie, 'E2E Search Movie: The Much Longer Sequel Title', null, 2026),
        ]);
    }

    public function imageUrl(?string $path, string $size = 'w500'): ?string
    {
        return $path === null ? null : '/favicon.svg';
    }
}
