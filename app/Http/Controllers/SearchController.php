<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\MediaExternalId;
use App\Models\User;
use App\Services\Library\MediaLibraryService;
use App\Services\Metadata\Data\MediaType;
use App\Services\Metadata\Data\SearchResult;
use App\Services\Metadata\MediaMetadataProvider;
use App\Services\Metadata\Tmdb\TmdbException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The Search screen (spec §5): a read-through TMDB search, with each hit
 * annotated against the household library and the current user's tracking so
 * the UI can show "already tracked" instead of a bare add button.
 *
 * openShow/openMovie are the "tap a result for details" path. A result the
 * household has never seen has no local row to fetch, so these resolve a
 * TMDB id through MediaLibraryService (find = cheap id lookup, create = the
 * one-time full metadata pull) and redirect to the canonical JSON detail
 * endpoint, which the detail modal's XHR follows transparently. Idempotent
 * by design, which is what makes a GET acceptable here.
 */
class SearchController extends Controller
{
    public function __construct(private readonly MediaMetadataProvider $tmdb) {}

    /**
     * Render the search page; with a query, include TMDB results annotated
     * with library/tracking state. A TMDB outage degrades to an error flag
     * rather than a 500 — the page stays usable.
     */
    public function index(Request $request): Response
    {
        $query = trim($request->string('q')->value());

        $results = null;
        $searchFailed = false;

        if ($query !== '') {
            try {
                $results = $this->annotate($this->tmdb->search($query), $request->user());
            } catch (TmdbException) {
                $searchFailed = true;
            }
        }

        return Inertia::render('search', [
            'q' => $query,
            'results' => $results,
            'searchFailed' => $searchFailed,
        ]);
    }

    /**
     * Open a show from a search result: find-or-create the shared Show for
     * this TMDB id, then land on its detail page.
     */
    public function openShow(MediaLibraryService $library, int $tmdbId): RedirectResponse
    {
        $show = $library->findOrCreateShow($tmdbId);

        return redirect()->route('shows.show', $show);
    }

    /**
     * Open a movie from a search result, same find-or-create semantics.
     */
    public function openMovie(MediaLibraryService $library, int $tmdbId): RedirectResponse
    {
        $movie = $library->findOrCreateMovie($tmdbId);

        return redirect()->route('movies.show', $movie);
    }

    /**
     * Merge library + tracking state into raw TMDB hits: which results already
     * have a local Show/Movie row, and what the current user's tracking says
     * about them (show status / movie watched flag).
     *
     * @param  list<SearchResult>  $hits
     * @return list<array<string, mixed>>
     */
    private function annotate(array $hits, User $user): array
    {
        $libraryIds = [
            MediaType::Show->value => $this->libraryIdsFor($hits, MediaType::Show),
            MediaType::Movie->value => $this->libraryIdsFor($hits, MediaType::Movie),
        ];

        $showStatuses = $user->showTrackings()
            ->whereIn('show_id', $libraryIds[MediaType::Show->value]->values())
            ->pluck('status', 'show_id');

        $movieWatched = $user->movieTrackings()
            ->whereIn('movie_id', $libraryIds[MediaType::Movie->value]->values())
            ->pluck('watched', 'movie_id');

        return array_map(function (SearchResult $hit) use ($libraryIds, $showStatuses, $movieWatched): array {
            $libraryId = $libraryIds[$hit->mediaType->value]->get((string) $hit->tmdbId);
            $libraryId = $libraryId !== null ? (int) $libraryId : null;

            [$status, $watched] = match ($hit->mediaType) {
                MediaType::Show => [$showStatuses->get($libraryId)?->value, null],
                MediaType::Movie => [null, $libraryId !== null && $movieWatched->has($libraryId) ? (bool) $movieWatched->get($libraryId) : null],
            };

            return [
                'tmdb_id' => $hit->tmdbId,
                'media_type' => $hit->mediaType->value,
                'title' => $hit->title,
                'poster_url' => $this->tmdb->imageUrl($hit->posterPath, 'w185'),
                'year' => $hit->year,
                'library_id' => $libraryId,
                'tracked' => ($hit->mediaType === MediaType::Show ? $status : $watched) !== null,
                'status' => $status,
                'watched' => $watched,
            ];
        }, $hits);
    }

    /**
     * TMDB id (as stored: string) → local media id, for every hit of one type
     * the household already has, in a single query.
     *
     * @param  list<SearchResult>  $hits
     * @return Collection<string, int>
     */
    private function libraryIdsFor(array $hits, MediaType $type): Collection
    {
        $tmdbIds = collect($hits)
            ->filter(fn (SearchResult $hit): bool => $hit->mediaType === $type)
            ->map(fn (SearchResult $hit): string => (string) $hit->tmdbId);

        if ($tmdbIds->isEmpty()) {
            return collect();
        }

        return MediaExternalId::query()
            ->where('provider', 'tmdb')
            ->where('media_type', $type->value)
            ->whereIn('external_id', $tmdbIds)
            ->pluck('media_id', 'external_id');
    }
}
