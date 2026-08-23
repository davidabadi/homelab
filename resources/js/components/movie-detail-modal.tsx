import { router, useHttp } from '@inertiajs/react';
import {
    BookmarkCheck,
    BookmarkPlus,
    CalendarDays,
    Clock,
    Eye,
    EyeOff,
    Film,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
    destroy as destroyMovieTracking,
    store as storeMovieTracking,
    toggleWatched as toggleMovieWatched,
} from '@/actions/App/Http/Controllers/MovieTrackingController';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DetailModal, DetailModalSkeleton } from '@/components/detail-modal';
import { MediaWatchControl } from '@/components/media-watch-control';
import { nextWatchCount } from '@/components/watched-toggle';
import type { WatchAction } from '@/components/watched-toggle';
import { formatLongDate, parseDateString } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { show as movieDetail } from '@/routes/movies';
import { open as openMovie } from '@/routes/search/movies';

type CollectionMovie = {
    tmdb_id: number;
    title: string;
    poster_url: string | null;
    year: number | null;
};

type MovieDetailPayload = {
    movie: {
        id: number;
        title: string;
        poster_url: string | null;
        overview: string | null;
        release_date: string | null;
        runtime_minutes: number | null;
        tmdb_id: number | null;
    };
    tracked: boolean;
    watched: boolean;
    watchCount: number;
    watchedDate: string | null;
    collection: {
        name: string;
        movies: CollectionMovie[];
    } | null;
};

type MovieSource =
    { kind: 'tmdb'; id: number } | { kind: 'library'; id: number };

function localToday(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The movie detail modal (spec §5, build item 11): a client-side modal opened
 * by TMDB id (search results) or by local movie id (Upcoming). Shows the
 * movie's franchise siblings (TMDB collection — direct entries only, no
 * spin-offs); tapping one swaps the modal to that movie. Reports on close
 * whether anything changed so the hosting screen can refresh.
 */
export function MovieDetailModal({
    tmdbId,
    movieId,
    title,
    onClose,
}: {
    tmdbId?: number | null;
    movieId?: number | null;
    title: string;
    onClose: (dirty: boolean) => void;
}) {
    const [source, setSource] = useState<MovieSource>(
        tmdbId != null
            ? { kind: 'tmdb', id: tmdbId }
            : { kind: 'library', id: movieId ?? 0 },
    );
    const [data, setData] = useState<MovieDetailPayload | null>(null);
    const [failed, setFailed] = useState(false);

    const [tracked, setTracked] = useState(false);
    const [watchCount, setWatchCount] = useState(0);
    const [watchedDate, setWatchedDate] = useState<string | null>(null);
    const [confirmingUntrack, setConfirmingUntrack] = useState(false);

    const watched = watchCount > 0;

    const dirty = useRef(false);

    const { get } = useHttp({});
    const toggleHttp = useHttp({ action: 'increment' as WatchAction });
    const trackHttp = useHttp({ tmdb_id: null as number | null });
    const untrackHttp = useHttp({});

    useEffect(() => {
        const url =
            source.kind === 'tmdb'
                ? openMovie.url(source.id)
                : movieDetail.url(source.id);

        get(url, {
            onSuccess: (response) => {
                const payload = response as MovieDetailPayload;

                setData(payload);
                setTracked(payload.tracked);
                setWatchCount(payload.watchCount);
                setWatchedDate(payload.watchedDate);
            },
            onHttpException: () => setFailed(true),
            onNetworkError: () => setFailed(true),
        });
        // Refetch only when the modal swaps to another movie.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source]);

    function markDirty() {
        dirty.current = true;
        // Prefetched pages (Upcoming etc.) are stale after any mutation.
        router.flushAll();
    }

    function handleWatchAction(action: WatchAction) {
        if (toggleHttp.processing || !data) {
            return;
        }

        const previousCount = watchCount;
        const previousDate = watchedDate;
        const previousTracked = tracked;
        const next = nextWatchCount(watchCount, action);

        markDirty();
        setWatchCount(next);
        setWatchedDate(next > 0 ? localToday() : null);
        // The toggle endpoint auto-creates the tracking row.
        setTracked(true);

        toggleHttp.transform(() => ({ action }));
        toggleHttp.patch(toggleMovieWatched.url(data.movie.id), {
            onError: () => {
                setWatchCount(previousCount);
                setWatchedDate(previousDate);
                setTracked(previousTracked);
            },
        });
    }

    function handleTrack() {
        if (tracked || trackHttp.processing || !data) {
            return;
        }

        const trackTmdbId = data.movie.tmdb_id;

        if (trackTmdbId === null) {
            return;
        }

        markDirty();
        setTracked(true);

        trackHttp.transform(() => ({ tmdb_id: trackTmdbId }));
        trackHttp.post(storeMovieTracking.url(), {
            onError: () => setTracked(false),
        });
    }

    function handleUntrackConfirmed() {
        if (!data || untrackHttp.processing) {
            return;
        }

        const snapshot = { tracked, watchCount, watchedDate };

        setConfirmingUntrack(false);
        markDirty();
        // Untracking resets progress: the tracking row carries watched state.
        setTracked(false);
        setWatchCount(0);
        setWatchedDate(null);

        untrackHttp.delete(destroyMovieTracking.url(data.movie.id), {
            onError: () => {
                setTracked(snapshot.tracked);
                setWatchCount(snapshot.watchCount);
                setWatchedDate(snapshot.watchedDate);
            },
        });
    }

    const close = () => onClose(dirty.current);

    const canTrack = data !== null && data.movie.tmdb_id !== null;

    return (
        <>
            <DetailModal
                label={data?.movie.title ?? title}
                onClose={close}
                escapeDisabled={confirmingUntrack}
            >
                {failed ? (
                    <p className="px-6 py-16 text-center text-sm text-muted-foreground">
                        Could not load this movie. Close and try again.
                    </p>
                ) : data === null ? (
                    <DetailModalSkeleton />
                ) : (
                    <>
                        <div className="relative h-64 overflow-hidden rounded-t-2xl md:h-72">
                            {data.movie.poster_url ? (
                                <img
                                    src={data.movie.poster_url}
                                    alt=""
                                    className="size-full object-cover object-[center_20%]"
                                />
                            ) : (
                                <div className="flex size-full items-center justify-center bg-muted">
                                    <Film className="size-10 text-muted-foreground" />
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                            <div className="absolute right-4 bottom-4 left-4 flex items-end justify-between gap-3">
                                <h1 className="min-w-0 truncate text-2xl font-bold">
                                    {data.movie.title}
                                </h1>
                                <MediaWatchControl
                                    count={watchCount}
                                    label={data.movie.title}
                                    onAction={handleWatchAction}
                                    disabled={toggleHttp.processing}
                                    elevated
                                />
                            </div>
                        </div>

                        <div className="px-4 pt-5 md:px-6">
                            <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1.5">
                                    <CalendarDays className="size-3.5" />
                                    {data.movie.release_date
                                        ? formatLongDate(
                                              parseDateString(
                                                  data.movie.release_date,
                                              ),
                                          )
                                        : 'Release date TBA'}
                                </span>
                                {data.movie.runtime_minutes !== null &&
                                    data.movie.runtime_minutes > 0 && (
                                        <span className="inline-flex items-center gap-1.5">
                                            <Clock className="size-3.5" />
                                            {data.movie.runtime_minutes} min
                                        </span>
                                    )}
                                <span className="inline-flex items-center gap-1.5">
                                    {watched ? (
                                        <>
                                            <Eye className="size-3.5 text-emerald-400" />
                                            {watchedDate
                                                ? `Watched ${formatLongDate(parseDateString(watchedDate))}`
                                                : 'Watched'}
                                            {watchCount > 1 &&
                                                ` · ${watchCount}×`}
                                        </>
                                    ) : (
                                        <>
                                            <EyeOff className="size-3.5" />
                                            Not watched
                                        </>
                                    )}
                                </span>
                            </div>

                            {/* Watchlist membership — kept well away from the
                                round watched toggle so the two aren't confused.
                                Adding to the list is separate from marking it
                                watched (which auto-adds it anyway). */}
                            {tracked ? (
                                <div className="mb-6 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                                        <BookmarkCheck className="size-4 text-emerald-400" />
                                        On your watchlist
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setConfirmingUntrack(true)
                                        }
                                        className="text-sm font-medium text-red-500 transition-colors hover:text-red-400"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ) : (
                                canTrack && (
                                    <button
                                        type="button"
                                        onClick={handleTrack}
                                        className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold transition-colors hover:border-foreground/40 hover:bg-card/70"
                                    >
                                        <BookmarkPlus className="size-4" />
                                        Add to Watchlist
                                    </button>
                                )
                            )}

                            <section>
                                <h2 className="mb-2 text-lg font-semibold">
                                    About
                                </h2>
                                <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                                    {data.movie.overview ??
                                        'No overview available.'}
                                </p>
                            </section>

                            {data.collection && (
                                <section className="mt-6">
                                    <h2 className="mb-3 text-lg font-semibold">
                                        {data.collection.name}
                                    </h2>
                                    {/* Breathing room on every edge so the
                                        current movie's ring isn't clipped by
                                        the scroll container. */}
                                    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pt-1 pb-2">
                                        {data.collection.movies.map((part) => {
                                            // The whole run is shown — the
                                            // current movie included, marked
                                            // and inert — so the release
                                            // order stays readable.
                                            const isCurrent =
                                                part.tmdb_id ===
                                                data.movie.tmdb_id;

                                            return (
                                                <button
                                                    key={part.tmdb_id}
                                                    type="button"
                                                    disabled={isCurrent}
                                                    onClick={() => {
                                                        // Swap the modal to
                                                        // this movie: clear
                                                        // the payload so the
                                                        // skeleton shows.
                                                        setData(null);
                                                        setFailed(false);
                                                        setSource({
                                                            kind: 'tmdb',
                                                            id: part.tmdb_id,
                                                        });
                                                    }}
                                                    className="w-24 shrink-0 text-left"
                                                >
                                                    {part.poster_url ? (
                                                        <img
                                                            src={
                                                                part.poster_url
                                                            }
                                                            alt=""
                                                            className={cn(
                                                                'aspect-2/3 w-full rounded-lg object-cover',
                                                                isCurrent
                                                                    ? 'ring-2 ring-emerald-500'
                                                                    : 'transition-opacity hover:opacity-80',
                                                            )}
                                                        />
                                                    ) : (
                                                        <div
                                                            className={cn(
                                                                'flex aspect-2/3 w-full items-center justify-center rounded-lg bg-muted',
                                                                isCurrent &&
                                                                    'ring-2 ring-emerald-500',
                                                            )}
                                                        >
                                                            <Film className="size-5 text-muted-foreground" />
                                                        </div>
                                                    )}
                                                    <p
                                                        className={cn(
                                                            'mt-1.5 line-clamp-2 min-h-[2lh] text-xs font-medium',
                                                            isCurrent &&
                                                                'text-emerald-400',
                                                        )}
                                                    >
                                                        {part.title}
                                                    </p>
                                                    <p
                                                        className="text-xs text-muted-foreground"
                                                        aria-label={
                                                            part.year === null
                                                                ? undefined
                                                                : `Released ${part.year}`
                                                        }
                                                    >
                                                        {part.year ?? '\u00a0'}
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}
                        </div>
                    </>
                )}
            </DetailModal>

            <ConfirmDialog
                open={confirmingUntrack}
                title={`Untrack ${data?.movie.title ?? title}?`}
                description="This removes the movie from your list and marks it as not watched."
                confirmLabel="Untrack"
                destructive
                elevated
                onConfirm={handleUntrackConfirmed}
                onOpenChange={setConfirmingUntrack}
            />
        </>
    );
}
