import { Head, router, useHttp } from '@inertiajs/react';
import {
    Check,
    Film,
    Plus,
    Search as SearchIcon,
    SearchX,
    Tv,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
    destroy as destroyMovieTracking,
    store as storeMovieTracking,
} from '@/actions/App/Http/Controllers/MovieTrackingController';
import {
    destroy as destroyShowTracking,
    store as storeShowTracking,
} from '@/actions/App/Http/Controllers/ShowTrackingController';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import Heading from '@/components/heading';
import { MovieDetailModal } from '@/components/movie-detail-modal';
import { PageScrollArea } from '@/components/page-scroll-area';
import { ShowDetailModal } from '@/components/show-detail-modal';
import { Spinner } from '@/components/ui/spinner';
import { showStatusLabel } from '@/lib/show-status';
import { cn } from '@/lib/utils';
import { search } from '@/routes';

type SearchResult = {
    tmdb_id: number;
    media_type: 'show' | 'movie';
    title: string;
    poster_url: string | null;
    year: number | null;
    library_id: number | null;
    tracked: boolean;
    status: string | null;
    watched: boolean | null;
};

/**
 * Client-side tweaks on top of the server annotations: tracked flips from the
 * row's track/untrack actions, and the library id becomes known the moment a
 * track request creates the shared row.
 */
type ResultOverride = {
    tracked: boolean;
    libraryId: number | null;
};

function resultKey(result: SearchResult): string {
    return `${result.media_type}-${result.tmdb_id}`;
}

function trackedLabel(result: SearchResult): string {
    if (result.media_type === 'show') {
        return showStatusLabel(result.status ?? '');
    }

    return result.watched ? 'Watched' : 'Tracking';
}

/**
 * The add/track action on one result (spec §5 Search): tracks the title for
 * the logged-in user — creating the shared Show/Movie on the household's
 * first sight of it. Optimistic with rollback. Once tracked, tapping again
 * asks to untrack (which also resets watched progress).
 */
function TrackButton({
    result,
    tracked,
    onSetOverride,
    onUntrackRequest,
}: {
    result: SearchResult;
    tracked: boolean;
    onSetOverride: (override: Partial<ResultOverride>) => void;
    onUntrackRequest: () => void;
}) {
    const { post, processing } = useHttp({ tmdb_id: result.tmdb_id });

    function handleTrack() {
        if (processing) {
            return;
        }

        onSetOverride({ tracked: true });
        // Prefetched pages (Upcoming etc.) are stale the moment we track.
        router.flushAll();

        const action =
            result.media_type === 'show'
                ? storeShowTracking
                : storeMovieTracking;

        post(action.url(), {
            onSuccess: (response) => {
                // The store response carries the shared row's id — remember it
                // so an untrack right after works without a results refresh.
                const payload = response as {
                    show?: { id: number };
                    movie?: { id: number };
                };

                onSetOverride({
                    tracked: true,
                    libraryId: payload.show?.id ?? payload.movie?.id ?? null,
                });
            },
            onError: () => onSetOverride({ tracked: false }),
        });
    }

    return (
        <button
            type="button"
            onClick={tracked ? onUntrackRequest : handleTrack}
            aria-label={
                tracked ? `Untrack ${result.title}` : `Track ${result.title}`
            }
            className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
                tracked
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
            )}
        >
            {tracked ? (
                <Check className="size-5" strokeWidth={2.5} />
            ) : (
                <Plus className="size-5" />
            )}
        </button>
    );
}

function ResultRow({
    result,
    tracked,
    onOpen,
    onSetOverride,
    onUntrackRequest,
}: {
    result: SearchResult;
    tracked: boolean;
    onOpen: () => void;
    onSetOverride: (override: Partial<ResultOverride>) => void;
    onUntrackRequest: () => void;
}) {
    const TypeIcon = result.media_type === 'show' ? Tv : Film;

    return (
        <li className="flex items-stretch overflow-hidden rounded-xl bg-card">
            <button
                type="button"
                onClick={onOpen}
                className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
            >
                {result.poster_url ? (
                    <img
                        src={result.poster_url}
                        alt=""
                        className="w-14 shrink-0 self-stretch object-cover"
                    />
                ) : (
                    <div className="flex w-14 shrink-0 items-center justify-center self-stretch bg-muted">
                        <TypeIcon className="size-5 text-muted-foreground" />
                    </div>
                )}
                <div className="min-w-0 flex-1 space-y-0.5 py-3.5">
                    <p className="truncate text-base font-semibold">
                        {result.title}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <TypeIcon className="size-3.5 shrink-0" />
                        <span>
                            {result.media_type === 'show' ? 'TV Show' : 'Movie'}
                            {result.year !== null && ` · ${result.year}`}
                        </span>
                        {tracked && (
                            <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                                {trackedLabel(result)}
                            </span>
                        )}
                    </p>
                </div>
            </button>
            <div className="flex items-center pr-3.5 pl-1">
                <TrackButton
                    result={result}
                    tracked={tracked}
                    onSetOverride={onSetOverride}
                    onUntrackRequest={onUntrackRequest}
                />
            </div>
        </li>
    );
}

export default function Search({
    q,
    results,
    searchFailed,
}: {
    q: string;
    results: SearchResult[] | null;
    searchFailed: boolean;
}) {
    const [term, setTerm] = useState(q);
    const [searching, setSearching] = useState(false);
    // Skip the debounce effect on mount — the server already rendered `q`.
    const lastRequested = useRef(q);

    const [detail, setDetail] = useState<SearchResult | null>(null);
    const [untrackTarget, setUntrackTarget] = useState<SearchResult | null>(
        null,
    );
    const [overrides, setOverrides] = useState<Record<string, ResultOverride>>(
        {},
    );

    const untrackHttp = useHttp({});

    useEffect(() => {
        const trimmed = term.trim();

        if (trimmed === lastRequested.current) {
            return;
        }

        const handle = setTimeout(() => {
            lastRequested.current = trimmed;

            router.get(search().url, trimmed === '' ? {} : { q: trimmed }, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onStart: () => setSearching(true),
                onFinish: () => setSearching(false),
            });
        }, 350);

        return () => clearTimeout(handle);
    }, [term]);

    function isTracked(result: SearchResult): boolean {
        return overrides[resultKey(result)]?.tracked ?? result.tracked;
    }

    function libraryIdOf(result: SearchResult): number | null {
        return overrides[resultKey(result)]?.libraryId ?? result.library_id;
    }

    function setOverride(
        result: SearchResult,
        override: Partial<ResultOverride>,
    ) {
        setOverrides((previous) => ({
            ...previous,
            [resultKey(result)]: {
                tracked: previous[resultKey(result)]?.tracked ?? result.tracked,
                libraryId:
                    previous[resultKey(result)]?.libraryId ?? result.library_id,
                ...override,
            },
        }));
    }

    function handleUntrackConfirmed() {
        const target = untrackTarget;

        if (!target || untrackHttp.processing) {
            return;
        }

        const libraryId = libraryIdOf(target);

        setUntrackTarget(null);

        if (libraryId === null) {
            return;
        }

        setOverride(target, { tracked: false });
        router.flushAll();

        const action =
            target.media_type === 'show'
                ? destroyShowTracking
                : destroyMovieTracking;

        untrackHttp.delete(action.url(libraryId), {
            onError: () => setOverride(target, { tracked: true }),
        });
    }

    function handleDetailClose(dirty: boolean) {
        setDetail(null);

        // The modal may have tracked/untracked/watched things — re-run the
        // search annotations so the list reflects it (spec: the hosting page
        // updates when the modal closes).
        if (dirty) {
            router.reload({
                only: ['results'],
                onSuccess: () => setOverrides({}),
            });
        }
    }

    return (
        <>
            <Head title="Search" />
            <Heading
                title="Search"
                description="Find shows and movies to track."
            />

            <div className="relative mb-6">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
                <input
                    type="search"
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    placeholder="Search shows and movies"
                    autoFocus
                    className="h-12 w-full rounded-xl border border-border bg-card pl-11 text-base outline-none placeholder:text-muted-foreground focus:border-emerald-500/60"
                />
                {searching && (
                    <Spinner className="absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
                )}
            </div>

            <PageScrollArea>
                {searchFailed ? (
                    <EmptyState
                        icon={SearchX}
                        title="Search is unavailable"
                        description="TMDB could not be reached. Give it a moment and try again."
                    />
                ) : results === null ? (
                    <EmptyState
                        icon={SearchIcon}
                        title="Search TMDB"
                        description="Find a show or movie, add it to your list, or open it for details."
                    />
                ) : results.length === 0 ? (
                    <EmptyState
                        icon={SearchX}
                        title="No results"
                        description={`Nothing matched “${q}”. Try a different title.`}
                    />
                ) : (
                    <ul className="space-y-3">
                        {results.map((result) => (
                            <ResultRow
                                key={resultKey(result)}
                                result={result}
                                tracked={isTracked(result)}
                                onOpen={() => setDetail(result)}
                                onSetOverride={(override) =>
                                    setOverride(result, override)
                                }
                                onUntrackRequest={() =>
                                    setUntrackTarget(result)
                                }
                            />
                        ))}
                    </ul>
                )}
            </PageScrollArea>

            {detail?.media_type === 'show' && (
                <ShowDetailModal
                    tmdbId={detail.tmdb_id}
                    title={detail.title}
                    onClose={handleDetailClose}
                />
            )}
            {detail?.media_type === 'movie' && (
                <MovieDetailModal
                    tmdbId={detail.tmdb_id}
                    title={detail.title}
                    onClose={handleDetailClose}
                />
            )}

            <ConfirmDialog
                open={untrackTarget !== null}
                title={`Untrack ${untrackTarget?.title ?? ''}?`}
                description={
                    untrackTarget?.media_type === 'show'
                        ? 'This removes the show from your list and marks every episode as not watched.'
                        : 'This removes the movie from your list and marks it as not watched.'
                }
                confirmLabel="Untrack"
                destructive
                onConfirm={handleUntrackConfirmed}
                onOpenChange={(open) => {
                    if (!open) {
                        setUntrackTarget(null);
                    }
                }}
            />
        </>
    );
}
