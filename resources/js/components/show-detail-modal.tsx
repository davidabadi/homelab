import { router, useHttp } from '@inertiajs/react';
import { Check, ChevronDown, Plus, Tv } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    toggle as toggleEpisodeWatched,
    toggleSeason as toggleSeasonWatched,
    watchThrough,
} from '@/actions/App/Http/Controllers/EpisodeWatchController';
import {
    destroy as destroyShowTracking,
    store as storeShowTracking,
} from '@/actions/App/Http/Controllers/ShowTrackingController';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Countdown } from '@/components/countdown';
import { DetailModal, DetailModalSkeleton } from '@/components/detail-modal';
import { EpisodeQuickView, episodeCode } from '@/components/episode-quick-view';
import type { QuickViewEpisode } from '@/components/episode-quick-view';
import { MediaWatchControl } from '@/components/media-watch-control';
import { Button } from '@/components/ui/button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { WatchedCircle } from '@/components/watched-circle';
import { nextWatchCount } from '@/components/watched-toggle';
import type { WatchAction } from '@/components/watched-toggle';
import { daysBetween, parseDateString } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { open as openShow } from '@/routes/search/shows';
import { show as showDetail } from '@/routes/shows';

type EpisodeItem = QuickViewEpisode & {
    watched: boolean;
    watch_count: number;
    watched_date: string | null;
};

type SeasonItem = {
    season_number: number;
    episodes: EpisodeItem[];
};

type ShowDetailPayload = {
    today: string;
    show: {
        id: number;
        title: string;
        poster_url: string | null;
        overview: string | null;
        season_count: number;
        tmdb_id: number | null;
    };
    trackingStatus: string | null;
    seasons: SeasonItem[];
};

type WatchState = {
    count: number;
    date: string | null;
};

function localToday(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${now.getFullYear()}-${month}-${day}`;
}

function daysUntilAirDate(episode: EpisodeItem, today: string): number | null {
    if (episode.air_date === null) {
        return null;
    }

    return daysBetween(
        parseDateString(today),
        parseDateString(episode.air_date),
    );
}

function hasAired(episode: EpisodeItem, today: string): boolean {
    const daysUntil = daysUntilAirDate(episode, today);

    return daysUntil !== null && daysUntil <= 0;
}

/**
 * Multi-watch control wired to the single-episode action endpoint, with the
 * count lifted to the modal so season counters and the quick view stay in sync.
 * Every action funnels through the modal's `onAction`, which can intercept a
 * first watch (the mark-previous catch-up prompt) before it applies.
 */
function EpisodeToggle({
    episode,
    count,
    onAction,
    className,
}: {
    episode: EpisodeItem;
    count: number;
    onAction: (episode: EpisodeItem, action: WatchAction) => void;
    className?: string;
}) {
    return (
        <MediaWatchControl
            count={count}
            label={episodeCode(episode)}
            onAction={(action) => onAction(episode, action)}
            className={className}
            elevated
        />
    );
}

function EpisodeStill({
    episode,
    className,
}: {
    episode: EpisodeItem;
    className?: string;
}) {
    if (episode.still_url === null) {
        return (
            <div
                className={cn(
                    'flex items-center justify-center bg-muted',
                    className,
                )}
            >
                <Tv className="size-5 text-muted-foreground" />
            </div>
        );
    }

    return (
        <img
            src={episode.still_url}
            alt=""
            className={cn('object-cover', className)}
        />
    );
}

/**
 * One collapsible season (spec §5 Show Detail), collapsed by default: header
 * with this user's watched/total count and a bulk toggle for the whole
 * season, episode rows inside. The bulk toggle is optimistic across every
 * episode in the season and restores the exact pre-toggle mix on failure.
 */
function SeasonCard({
    showId,
    season,
    watchState,
    onSetSeason,
    onRestore,
    onOpenEpisode,
    onEpisodeAction,
    today,
}: {
    showId: number;
    season: SeasonItem;
    watchState: Record<number, WatchState>;
    onSetSeason: (seasonNumber: number, watched: boolean) => void;
    onRestore: (entries: Array<[number, WatchState]>) => void;
    onOpenEpisode: (episode: EpisodeItem) => void;
    onEpisodeAction: (episode: EpisodeItem, action: WatchAction) => void;
    today: string;
}) {
    const { patch, transform, processing } = useHttp({ watched: false });

    const airedEpisodes = season.episodes.filter((episode) =>
        hasAired(episode, today),
    );
    const airedTotal = airedEpisodes.length;
    const airedWatchedCount = airedEpisodes.filter(
        (episode) => (watchState[episode.id]?.count ?? 0) > 0,
    ).length;
    const total = season.episodes.length;
    const watchedCount = season.episodes.filter(
        (episode) => (watchState[episode.id]?.count ?? 0) > 0,
    ).length;
    const allWatched = airedTotal > 0 && airedWatchedCount === airedTotal;

    function handleBulkToggle() {
        if (processing || airedTotal === 0) {
            return;
        }

        const next = !allWatched;
        const snapshot = airedEpisodes.map((episode): [number, WatchState] => [
            episode.id,
            watchState[episode.id] ?? { count: 0, date: null },
        ]);

        onSetSeason(season.season_number, next);

        transform(() => ({ watched: next }));
        patch(
            toggleSeasonWatched.url({
                show: showId,
                season: season.season_number,
            }),
            { onError: () => onRestore(snapshot) },
        );
    }

    return (
        <Collapsible>
            <div
                className={cn(
                    'overflow-hidden rounded-xl border-b-2 bg-card',
                    allWatched ? 'border-emerald-500' : 'border-transparent',
                )}
            >
                <div className="flex items-center gap-3 p-3.5">
                    <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 text-left">
                        <span className="text-base font-semibold">
                            Season {season.season_number}
                        </span>
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                        <span className="ml-auto text-sm text-muted-foreground">
                            {watchedCount}/{total}
                        </span>
                    </CollapsibleTrigger>
                    {airedTotal > 0 && (
                        <WatchedCircle
                            watched={allWatched}
                            onToggle={handleBulkToggle}
                            label={`all aired episodes of season ${season.season_number}`}
                        />
                    )}
                </div>
                <CollapsibleContent>
                    <ul className="space-y-px pb-1">
                        {season.episodes.map((episode) => (
                            <li
                                key={episode.id}
                                className="flex items-center gap-3 border-t border-border/40 py-2 pr-3.5 pl-3.5"
                            >
                                <button
                                    type="button"
                                    onClick={() => onOpenEpisode(episode)}
                                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                >
                                    <EpisodeStill
                                        episode={episode}
                                        className="aspect-video w-24 shrink-0 rounded-md"
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold">
                                            {episodeCode(episode)}
                                        </span>
                                        <span className="block truncate text-sm text-muted-foreground">
                                            {episode.title ?? 'TBA'}
                                        </span>
                                    </span>
                                </button>
                                {hasAired(episode, today) ? (
                                    <EpisodeToggle
                                        episode={episode}
                                        count={
                                            watchState[episode.id]?.count ?? 0
                                        }
                                        onAction={onEpisodeAction}
                                    />
                                ) : daysUntilAirDate(episode, today) !==
                                  null ? (
                                    <Countdown
                                        daysUntil={
                                            daysUntilAirDate(episode, today) ??
                                            0
                                        }
                                    />
                                ) : (
                                    <span className="shrink-0 text-xs font-semibold text-muted-foreground uppercase">
                                        TBA
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}

/**
 * The show detail modal (spec §5, build item 11): a client-side modal opened
 * by TMDB id (search results — find-or-create resolve) or by local show id
 * (screens that already know the library row, e.g. Upcoming). Tracks whether
 * anything changed and reports it on close so the hosting screen can refresh.
 */
export function ShowDetailModal({
    tmdbId,
    showId,
    title,
    onClose,
}: {
    tmdbId?: number | null;
    showId?: number | null;
    title: string;
    onClose: (dirty: boolean) => void;
}) {
    const { get } = useHttp({});
    const [data, setData] = useState<ShowDetailPayload | null>(null);
    const [failed, setFailed] = useState(false);

    const [activeTab, setActiveTab] = useState<'about' | 'episodes'>(
        'episodes',
    );
    const [quickViewEpisode, setQuickViewEpisode] =
        useState<EpisodeItem | null>(null);
    const [pendingWatch, setPendingWatch] = useState<EpisodeItem | null>(null);
    const [confirmingUntrack, setConfirmingUntrack] = useState(false);
    const [tracked, setTracked] = useState(false);
    const [watchState, setWatchState] = useState<Record<number, WatchState>>(
        {},
    );

    // Whether this session mutated anything the hosting screen may display.
    const dirty = useRef(false);

    const trackHttp = useHttp({ tmdb_id: null as number | null });
    const untrackHttp = useHttp({});
    const episodeActionHttp = useHttp({ action: 'increment' as WatchAction });
    const promptToggleHttp = useHttp({ action: 'increment' as WatchAction });
    const watchThroughHttp = useHttp({});

    useEffect(() => {
        const url =
            tmdbId != null ? openShow.url(tmdbId) : showDetail.url(showId ?? 0);

        get(url, {
            onSuccess: (response) => {
                const payload = response as ShowDetailPayload;

                setData(payload);
                setTracked(payload.trackingStatus !== null);
                setWatchState(
                    Object.fromEntries(
                        payload.seasons.flatMap((season) =>
                            season.episodes.map((episode) => [
                                episode.id,
                                {
                                    count: episode.watch_count,
                                    date: episode.watched_date,
                                },
                            ]),
                        ),
                    ),
                );
            },
            onHttpException: () => setFailed(true),
            onNetworkError: () => setFailed(true),
        });
        // The modal mounts fresh for each open; fetch exactly once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const episodesInOrder = useMemo(
        () => (data?.seasons ?? []).flatMap((season) => season.episodes),
        [data],
    );

    // "Continue tracking" (spec §5): this user's first unwatched episode in
    // airing order. Recomputed from live state so it moves forward as
    // episodes are ticked off.
    const nextUnwatched =
        episodesInOrder.find(
            (episode) =>
                hasAired(episode, data?.today ?? localToday()) &&
                (watchState[episode.id]?.count ?? 0) === 0,
        ) ?? null;

    function markDirty() {
        dirty.current = true;
        // Prefetched pages (Upcoming etc.) are stale after any mutation.
        router.flushAll();
    }

    function setEpisodeCount(episodeId: number, count: number) {
        markDirty();
        setTracked(true);
        setWatchState((previous) => ({
            ...previous,
            [episodeId]: {
                count,
                date:
                    count > 0
                        ? (previous[episodeId]?.date ?? localToday())
                        : null,
            },
        }));
    }

    function setSeason(seasonNumber: number, watched: boolean) {
        const season = data?.seasons.find(
            (item) => item.season_number === seasonNumber,
        );

        if (!season) {
            return;
        }

        markDirty();
        setTracked(true);
        setWatchState((previous) => ({
            ...previous,
            ...Object.fromEntries(
                season.episodes
                    .filter((episode) =>
                        hasAired(episode, data?.today ?? localToday()),
                    )
                    .map((episode) => {
                        // Marking watched keeps any existing rewatch count (matching
                        // the backend), so a bulk toggle never wipes a "×3".
                        const existing = previous[episode.id]?.count ?? 0;
                        const count = watched ? Math.max(existing, 1) : 0;

                        return [
                            episode.id,
                            {
                                count,
                                date:
                                    count > 0
                                        ? (previous[episode.id]?.date ??
                                          localToday())
                                        : null,
                            },
                        ];
                    }),
            ),
        }));
    }

    function restore(entries: Array<[number, WatchState]>) {
        setWatchState((previous) => ({
            ...previous,
            ...Object.fromEntries(entries),
        }));
    }

    /**
     * The single funnel every episode toggle/sheet action flows through. A first
     * watch (0 → 1) on an episode with earlier unwatched ones opens the catch-up
     * prompt instead of applying straight away; everything else applies
     * optimistically against the item-6 action endpoint, rolling back on failure.
     */
    function applyEpisodeAction(episode: EpisodeItem, action: WatchAction) {
        if (episodeActionHttp.processing) {
            return;
        }

        const current = watchState[episode.id]?.count ?? 0;

        if (
            action === 'increment' &&
            current === 0 &&
            interceptWatch(episode)
        ) {
            return;
        }

        const snapshot = watchState[episode.id] ?? { count: 0, date: null };
        setEpisodeCount(episode.id, nextWatchCount(current, action));

        episodeActionHttp.transform(() => ({ action }));
        episodeActionHttp.patch(toggleEpisodeWatched.url(episode.id), {
            onError: () => restore([[episode.id, snapshot]]),
        });
    }

    /**
     * Marking an episode watched while earlier ones are still unwatched opens
     * the catch-up prompt instead of applying straight away.
     */
    function interceptWatch(episode: EpisodeItem): boolean {
        const index = episodesInOrder.findIndex(
            (item) => item.id === episode.id,
        );
        const hasPreviousUnwatched = episodesInOrder
            .slice(0, index)
            .some((item) => (watchState[item.id]?.count ?? 0) === 0);

        if (hasPreviousUnwatched) {
            setPendingWatch(episode);

            return true;
        }

        return false;
    }

    function watchPendingOnly() {
        const episode = pendingWatch;

        if (!episode || promptToggleHttp.processing) {
            return;
        }

        setPendingWatch(null);
        setEpisodeCount(episode.id, 1);

        promptToggleHttp.transform(() => ({ action: 'increment' }));
        promptToggleHttp.patch(toggleEpisodeWatched.url(episode.id), {
            onError: () => setEpisodeCount(episode.id, 0),
        });
    }

    function watchPendingAndPrevious() {
        const episode = pendingWatch;

        if (!episode || watchThroughHttp.processing) {
            return;
        }

        const index = episodesInOrder.findIndex(
            (item) => item.id === episode.id,
        );
        const through = episodesInOrder.slice(0, index + 1);
        const snapshot = through.map((item): [number, WatchState] => [
            item.id,
            watchState[item.id] ?? { count: 0, date: null },
        ]);

        setPendingWatch(null);
        markDirty();
        setTracked(true);
        setWatchState((previous) => ({
            ...previous,
            ...Object.fromEntries(
                through.map((item) => [
                    item.id,
                    {
                        count: Math.max(previous[item.id]?.count ?? 0, 1),
                        date: previous[item.id]?.date ?? localToday(),
                    },
                ]),
            ),
        }));

        watchThroughHttp.patch(watchThrough.url(episode.id), {
            onError: () => restore(snapshot),
        });
    }

    function handleTrack() {
        if (tracked || trackHttp.processing || !data) {
            return;
        }

        const trackTmdbId = data.show.tmdb_id;

        if (trackTmdbId === null) {
            return;
        }

        markDirty();
        setTracked(true);

        trackHttp.transform(() => ({ tmdb_id: trackTmdbId }));
        trackHttp.post(storeShowTracking.url(), {
            onError: () => setTracked(false),
        });
    }

    function handleUntrackConfirmed() {
        if (!data || untrackHttp.processing) {
            return;
        }

        const trackedSnapshot = tracked;
        const watchSnapshot = watchState;

        setConfirmingUntrack(false);
        markDirty();
        setTracked(false);
        // Untracking resets progress: everything back to unwatched.
        setWatchState(
            Object.fromEntries(
                episodesInOrder.map((episode) => [
                    episode.id,
                    { count: 0, date: null },
                ]),
            ),
        );

        untrackHttp.delete(destroyShowTracking.url(data.show.id), {
            onError: () => {
                setTracked(trackedSnapshot);
                setWatchState(watchSnapshot);
            },
        });
    }

    /**
     * Quick-view browsing: previous/next in airing order over the already
     * loaded episode list.
     */
    function navigateQuickView(direction: 'previous' | 'next') {
        if (!quickViewEpisode) {
            return;
        }

        const index = episodesInOrder.findIndex(
            (item) => item.id === quickViewEpisode.id,
        );
        const target =
            episodesInOrder[direction === 'previous' ? index - 1 : index + 1];

        if (target) {
            setQuickViewEpisode(target);
        }
    }

    const close = () => onClose(dirty.current);

    const quickViewIndex = quickViewEpisode
        ? episodesInOrder.findIndex((item) => item.id === quickViewEpisode.id)
        : -1;
    const quickViewWatch = quickViewEpisode
        ? (watchState[quickViewEpisode.id] ?? { count: 0, date: null })
        : { count: 0, date: null };
    const quickViewDaysUntil = quickViewEpisode
        ? daysUntilAirDate(quickViewEpisode, data?.today ?? localToday())
        : null;

    const innerDialogOpen =
        quickViewEpisode !== null || pendingWatch !== null || confirmingUntrack;

    const canTrack = data !== null && data.show.tmdb_id !== null;

    return (
        <>
            <DetailModal
                label={data?.show.title ?? title}
                onClose={close}
                escapeDisabled={innerDialogOpen}
            >
                {failed ? (
                    <p className="px-6 py-16 text-center text-sm text-muted-foreground">
                        Could not load this show. Close and try again.
                    </p>
                ) : data === null ? (
                    <DetailModalSkeleton />
                ) : (
                    <>
                        <div className="relative h-64 overflow-hidden rounded-t-2xl md:h-72">
                            {data.show.poster_url ? (
                                <img
                                    src={data.show.poster_url}
                                    alt=""
                                    className="size-full object-cover object-[center_20%]"
                                />
                            ) : (
                                <div className="flex size-full items-center justify-center bg-muted">
                                    <Tv className="size-10 text-muted-foreground" />
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                            <div className="absolute right-4 bottom-4 left-4 flex items-end justify-between gap-3">
                                <div className="min-w-0">
                                    <h1 className="truncate text-2xl font-bold">
                                        {data.show.title}
                                    </h1>
                                    <p className="text-sm text-muted-foreground">
                                        {data.show.season_count}{' '}
                                        {data.show.season_count === 1
                                            ? 'season'
                                            : 'seasons'}
                                    </p>
                                </div>
                                {(tracked || canTrack) && (
                                    <button
                                        type="button"
                                        onClick={
                                            tracked
                                                ? () =>
                                                      setConfirmingUntrack(true)
                                                : handleTrack
                                        }
                                        aria-label={
                                            tracked
                                                ? `Untrack ${data.show.title}`
                                                : `Track ${data.show.title}`
                                        }
                                        className={cn(
                                            'flex size-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
                                            tracked
                                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                                : 'border-border bg-background/60 text-muted-foreground backdrop-blur hover:border-foreground/40 hover:text-foreground',
                                        )}
                                    >
                                        {tracked ? (
                                            <Check
                                                className="size-5"
                                                strokeWidth={2.5}
                                            />
                                        ) : (
                                            <Plus className="size-5" />
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="px-4 pt-5 md:px-6">
                            <nav className="mb-6 grid grid-cols-2 border-b border-border/60">
                                {(['about', 'episodes'] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setActiveTab(tab)}
                                        className={cn(
                                            '-mb-px border-b-2 pt-1 pb-2.5 text-center text-sm font-semibold tracking-widest uppercase transition-colors',
                                            activeTab === tab
                                                ? 'border-foreground text-foreground'
                                                : 'border-transparent text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </nav>

                            {activeTab === 'about' ? (
                                <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                                    {data.show.overview ??
                                        'No overview available.'}
                                </p>
                            ) : (
                                <div className="space-y-6">
                                    {nextUnwatched && (
                                        <section>
                                            <h2 className="mb-3 text-lg font-semibold">
                                                Continue tracking
                                            </h2>
                                            <div className="flex items-stretch overflow-hidden rounded-xl bg-card">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setQuickViewEpisode(
                                                            nextUnwatched,
                                                        )
                                                    }
                                                    className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
                                                >
                                                    <EpisodeStill
                                                        episode={nextUnwatched}
                                                        className="w-32 shrink-0 self-stretch"
                                                    />
                                                    <span className="min-w-0 flex-1 py-3.5">
                                                        <span className="block text-base font-semibold">
                                                            {episodeCode(
                                                                nextUnwatched,
                                                            )}
                                                        </span>
                                                        <span className="block truncate text-sm text-muted-foreground">
                                                            {nextUnwatched.title ??
                                                                'TBA'}
                                                        </span>
                                                    </span>
                                                </button>
                                                <div className="flex items-center pr-3.5 pl-1">
                                                    <EpisodeToggle
                                                        episode={nextUnwatched}
                                                        count={
                                                            watchState[
                                                                nextUnwatched.id
                                                            ]?.count ?? 0
                                                        }
                                                        onAction={
                                                            applyEpisodeAction
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        </section>
                                    )}

                                    <section>
                                        <h2 className="mb-3 text-lg font-semibold">
                                            All episodes
                                        </h2>
                                        {data.seasons.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">
                                                No episodes yet.
                                            </p>
                                        ) : (
                                            <div className="space-y-3">
                                                {data.seasons.map((season) => (
                                                    <SeasonCard
                                                        key={
                                                            season.season_number
                                                        }
                                                        showId={data.show.id}
                                                        season={season}
                                                        watchState={watchState}
                                                        onSetSeason={setSeason}
                                                        onRestore={restore}
                                                        onOpenEpisode={
                                                            setQuickViewEpisode
                                                        }
                                                        onEpisodeAction={
                                                            applyEpisodeAction
                                                        }
                                                        today={data.today}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </DetailModal>

            <ConfirmDialog
                open={confirmingUntrack}
                title={`Untrack ${data?.show.title ?? title}?`}
                description="This removes the show from your list and marks every episode as not watched."
                confirmLabel="Untrack"
                destructive
                elevated
                onConfirm={handleUntrackConfirmed}
                onOpenChange={setConfirmingUntrack}
            />

            <Dialog
                open={pendingWatch !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingWatch(null);
                    }
                }}
            >
                {pendingWatch && (
                    <DialogContent
                        className="z-[70] max-w-sm"
                        overlayClassName="z-[70]"
                        showCloseButton={false}
                    >
                        <DialogHeader className="text-left">
                            <DialogTitle>
                                Catch up to {episodeCode(pendingWatch)}?
                            </DialogTitle>
                            <DialogDescription>
                                There are earlier episodes you haven't marked as
                                watched yet. Mark them too?
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="ghost" onClick={watchPendingOnly}>
                                Just this episode
                            </Button>
                            <Button onClick={watchPendingAndPrevious}>
                                Mark previous too
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                )}
            </Dialog>

            <EpisodeQuickView
                open={quickViewEpisode !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setQuickViewEpisode(null);
                    }
                }}
                episode={quickViewEpisode}
                showTitle={data?.show.title}
                watched={quickViewWatch.count > 0}
                watchCount={quickViewWatch.count}
                watchedDate={quickViewWatch.date}
                toggle={
                    quickViewEpisode && quickViewDaysUntil === null ? (
                        <span className="text-xs font-semibold text-muted-foreground uppercase">
                            TBA
                        </span>
                    ) : quickViewEpisode &&
                      quickViewDaysUntil !== null &&
                      quickViewDaysUntil > 0 ? (
                        <Countdown daysUntil={quickViewDaysUntil} />
                    ) : quickViewEpisode ? (
                        <EpisodeToggle
                            episode={quickViewEpisode}
                            count={quickViewWatch.count}
                            onAction={applyEpisodeAction}
                        />
                    ) : null
                }
                hasPrevious={quickViewIndex > 0}
                hasNext={
                    quickViewIndex !== -1 &&
                    quickViewIndex < episodesInOrder.length - 1
                }
                onNavigate={navigateQuickView}
                position={quickViewIndex === -1 ? null : quickViewIndex}
                total={episodesInOrder.length}
                elevated
            />
        </>
    );
}
