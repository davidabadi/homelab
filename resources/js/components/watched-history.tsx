import { useHttp } from '@inertiajs/react';
import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { ShowWatchRow } from '@/components/show-watch-row';
import type { ShowWatchRowData } from '@/components/show-watch-row';
import { Spinner } from '@/components/ui/spinner';
import {
    scrollTopAfterPrepend,
    scrollTopAtAnchor,
    shouldLoadOlderHistory,
} from '@/lib/watch-list-layout';
import { watchedHistory } from '@/routes/shows';

type HistoryResponse = {
    rows: ShowWatchRowData[];
    nextCursor: string | null;
    hasMore: boolean;
};

export type WatchedHistoryHandle = {
    /** Add a just-watched episode to the bottom (newest) of the history. */
    recordWatch: (row: ShowWatchRowData) => void;
};

// Fire the next (older) page once the user scrolls within this many px of the top.
const LOAD_AT = 8;

/**
 * Watched History (spec Part 2 §3), sitting above Watch Next / Haven't Started:
 * this user's watched episodes, dimmed, most-recent nearest Watch Next and older
 * entries further up — a chat-log that pages older content upward.
 *
 * The first page is loaded eagerly on mount but parked off-screen above Watch
 * Next, so the initial view is Watch Next and the first scroll-up reveals ready
 * rows with no spinner; the spinner only appears once the user pages past that
 * first batch. Older pages prepend with scroll-anchoring so the content under the
 * user's eyes stays put. `recordWatch` appends a freshly-watched episode live at
 * the bottom without waiting for a reload. Reuses the shared row component.
 */
export const WatchedHistory = forwardRef<
    WatchedHistoryHandle,
    {
        scrollRef: React.RefObject<HTMLDivElement | null>;
        watchListAnchorRef: React.RefObject<HTMLDivElement | null>;
        onOpenShow: (row: ShowWatchRowData) => void;
        onOpenEpisode: (episodeId: number) => void;
        onEpisodeUnwatched: () => void;
    }
>(function WatchedHistory(
    {
        scrollRef,
        watchListAnchorRef,
        onOpenShow,
        onOpenEpisode,
        onEpisodeUnwatched,
    },
    ref,
) {
    const [rows, setRows] = useState<ShowWatchRowData[]>([]);
    const [loading, setLoading] = useState(false);

    const { get, cancel } = useHttp({});

    const cursor = useRef<string | null>(null);
    const hasMore = useRef(true);
    const loadingLock = useRef(false);
    const initialised = useRef(false);
    // scrollHeight captured just before content is added above the fold, to
    // compensate scrollTop after and keep the viewport visually still.
    const initialPageLoaded = useRef(false);
    const initialPlacementComplete = useRef(false);
    const lastScrollTop = useRef(0);
    const pendingAdjustment = useRef<
        | { kind: 'initial' }
        | { kind: 'preserve'; previousHeight: number }
        | null
    >(null);

    const loadOlder = useCallback(() => {
        if (loadingLock.current || !hasMore.current) {
            return;
        }

        loadingLock.current = true;
        setLoading(true);

        const query = cursor.current ? { cursor: cursor.current } : {};

        get(watchedHistory.url({ query }), {
            onSuccess: (response) => {
                const payload = response as HistoryResponse;
                const element = scrollRef.current;

                const isInitialPage = !initialPageLoaded.current;

                pendingAdjustment.current = isInitialPage
                    ? { kind: 'initial' }
                    : element
                      ? {
                            kind: 'preserve',
                            previousHeight: element.scrollHeight,
                        }
                      : null;

                // Server sends newest-first; reverse so the batch reads
                // oldest→newest top-to-bottom, then prepend older-than-loaded.
                setRows((previous) => [
                    ...[...payload.rows].reverse(),
                    ...previous,
                ]);
                cursor.current = payload.nextCursor;
                hasMore.current = payload.hasMore;
                initialPageLoaded.current = true;

                if (payload.rows.length === 0) {
                    initialPlacementComplete.current = true;
                }
            },
            onError: () => {
                hasMore.current = false;
            },
            onFinish: () => {
                loadingLock.current = false;
                setLoading(false);
            },
        });
    }, [get, scrollRef]);

    // Every mount, including back navigation, deliberately starts at the Watch
    // List anchor. The first history commit is positioned in a layout effect,
    // before that committed layout can paint.
    useEffect(() => {
        if (initialised.current) {
            return;
        }

        initialised.current = true;
        loadOlder();
    }, [loadOlder]);

    useEffect(() => cancel, [cancel]);

    // Initial hydration uses the structural Watch List anchor. Later prepends
    // and successful watch insertions preserve the user's current viewport.
    useLayoutEffect(() => {
        const element = scrollRef.current;
        const adjustment = pendingAdjustment.current;

        if (!element || adjustment === null) {
            return;
        }

        if (adjustment.kind === 'initial') {
            const watchListAnchor = watchListAnchorRef.current;

            if (watchListAnchor) {
                const scrollBounds = element.getBoundingClientRect();
                const anchorBounds = watchListAnchor.getBoundingClientRect();

                element.scrollTop = scrollTopAtAnchor(
                    element.scrollTop,
                    anchorBounds.top,
                    scrollBounds.top,
                );
            }

            initialPlacementComplete.current = true;
        } else {
            element.scrollTop = scrollTopAfterPrepend(
                element.scrollTop,
                element.scrollHeight,
                adjustment.previousHeight,
            );
        }

        lastScrollTop.current = element.scrollTop;
        pendingAdjustment.current = null;
    }, [rows, scrollRef, watchListAnchorRef]);

    useEffect(() => {
        const element = scrollRef.current;

        if (!element) {
            return;
        }

        function onScroll() {
            const currentScrollTop = element!.scrollTop;
            const shouldLoad = shouldLoadOlderHistory(
                currentScrollTop,
                lastScrollTop.current,
                initialPlacementComplete.current,
                LOAD_AT,
            );

            lastScrollTop.current = currentScrollTop;

            if (shouldLoad) {
                loadOlder();
            }
        }

        element.addEventListener('scroll', onScroll, { passive: true });

        return () => element.removeEventListener('scroll', onScroll);
    }, [scrollRef, loadOlder]);

    useImperativeHandle(
        ref,
        () => ({
            recordWatch: (row) => {
                const episode = row.episode;

                if (!episode) {
                    return;
                }

                const element = scrollRef.current;
                // The new row lands at the bottom of history, just above the
                // fold — anchor so it doesn't nudge Watch Next down.
                pendingAdjustment.current = element
                    ? {
                          kind: 'preserve',
                          previousHeight: element.scrollHeight,
                      }
                    : null;

                const historyRow: ShowWatchRowData = {
                    ...row,
                    section: 'watched_history',
                    status: null,
                    has_progress: true,
                    remaining: 0,
                    badge: null,
                    next_episode: null,
                    last_watched_at: new Date().toISOString(),
                    episode: {
                        ...episode,
                        watch_count: episode.watch_count + 1,
                    },
                };

                // A rewatch of an already-listed episode moves to the bottom.
                setRows((previous) => [
                    ...previous.filter(
                        (item) => item.episode?.id !== episode.id,
                    ),
                    historyRow,
                ]);
            },
        }),
        [scrollRef],
    );

    if (rows.length === 0) {
        return null;
    }

    return (
        <div style={{ overflowAnchor: 'none' }}>
            {/* Pill pinned to the top of the viewport while any history is in
                view; scrolls away only once Watch Next reaches the top (item 4).
                Solid background so the dimmed rows read cleanly beneath it. */}
            <div className="sticky top-0 z-10 bg-background pt-1 pb-3">
                <div className="flex justify-center">
                    <span className="rounded-full bg-muted px-3.5 py-1 text-xs font-semibold tracking-wider uppercase">
                        Watched History
                    </span>
                </div>
            </div>

            {/* Spinner shows only when paging older (never the eager first
                batch, which loads while rows is still empty). */}
            {loading && (
                <div className="flex justify-center pb-3">
                    <Spinner className="size-5 text-muted-foreground" />
                </div>
            )}

            <ul className="space-y-3 opacity-45">
                {rows.map((row) => (
                    <ShowWatchRow
                        key={`history-${row.episode?.id ?? row.show_id}`}
                        row={row}
                        onOpenShow={() => onOpenShow(row)}
                        onOpenEpisode={onOpenEpisode}
                        onWatchCount={(count) => {
                            const episodeId = row.episode?.id;

                            if (episodeId === undefined) {
                                return;
                            }

                            setRows((current) => {
                                const updatedRow = {
                                    ...row,
                                    episode: row.episode
                                        ? { ...row.episode, watch_count: count }
                                        : null,
                                };
                                const existingIndex = current.findIndex(
                                    (item) => item.episode?.id === episodeId,
                                );

                                if (existingIndex === -1) {
                                    return [...current, updatedRow];
                                }

                                return current.map((item, index) =>
                                    index === existingIndex ? updatedRow : item,
                                );
                            });
                        }}
                        onWatchSuccess={(count) => {
                            if (count === 0) {
                                const episodeId = row.episode?.id;

                                if (episodeId === undefined) {
                                    return;
                                }

                                setRows((current) =>
                                    current.filter(
                                        (item) =>
                                            item.episode?.id !== episodeId,
                                    ),
                                );
                                onEpisodeUnwatched();
                            }
                        }}
                    />
                ))}
            </ul>

            <div className="h-6" />
        </div>
    );
});
