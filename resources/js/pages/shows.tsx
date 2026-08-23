import { Head, router, useHttp } from '@inertiajs/react';
import { Check, EyeOff, Tv } from 'lucide-react';
import type { CSSProperties } from 'react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { toggle as toggleEpisode } from '@/actions/App/Http/Controllers/EpisodeWatchController';
import {
    removeFromList,
    setStatus,
} from '@/actions/App/Http/Controllers/ShowTrackingController';
import { EmptyState } from '@/components/empty-state';
import { EpisodeQuickViewModal } from '@/components/episode-quick-view-modal';
import Heading from '@/components/heading';
import { MediaSubTabs } from '@/components/media-sub-tabs';
import { PageScrollArea } from '@/components/page-scroll-area';
import { ShowDetailModal } from '@/components/show-detail-modal';
import { ShowStatusSheet } from '@/components/show-status-sheet';
import type { StatusAction } from '@/components/show-status-sheet';
import { ShowWatchRow } from '@/components/show-watch-row';
import type { ShowWatchRowData } from '@/components/show-watch-row';
import { WatchedHistory } from '@/components/watched-history';
import type { WatchedHistoryHandle } from '@/components/watched-history';
import type { WatchAction } from '@/components/watched-toggle';
import { hasAired } from '@/lib/media';
import { cn } from '@/lib/utils';
import { positionRelativeTo } from '@/lib/watch-list-layout';
import { shows } from '@/routes';
import { upcoming } from '@/routes/shows';

type WatchListPayload = {
    watchNext: ShowWatchRowData[];
    haventStarted: ShowWatchRowData[];
    watchLaterCount: number;
    watchLater?: ShowWatchRowData[];
};

type ActiveMutation = {
    generation: number;
    showId: number;
    sweepStart: number;
    sweepComplete: boolean;
    movementComplete: boolean;
    overlayComplete: boolean;
    phase: 'saving' | 'reconciling' | 'moving' | 'removing';
    authoritative: WatchListPayload | null;
};

type RelativePosition = { left: number; top: number };

function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Explicit FLIP for a single authoritative reconciliation. Measurements are
 * relative to the stable Watch List wrapper, so history prepends and scrollTop
 * changes cannot masquerade as list movement.
 */
function useAuthoritativeFlip(
    wrapperRef: React.RefObject<HTMLDivElement | null>,
) {
    const nodes = useRef(new Map<number, HTMLLIElement>());
    const activeAnimations = useRef(new Map<number, Animation>());
    const beforePositions = useRef<Map<number, RelativePosition> | null>(null);
    const completion = useRef<(() => void) | null>(null);
    const animationGeneration = useRef(0);

    const measure = useCallback(() => {
        const wrapper = wrapperRef.current;
        const positions = new Map<number, RelativePosition>();

        if (!wrapper) {
            return positions;
        }

        const wrapperBounds = wrapper.getBoundingClientRect();

        nodes.current.forEach((node, id) => {
            const bounds = node.getBoundingClientRect();

            positions.set(id, positionRelativeTo(bounds, wrapperBounds));
        });

        return positions;
    }, [wrapperRef]);

    const cancelAnimations = useCallback(() => {
        animationGeneration.current += 1;
        activeAnimations.current.forEach((animation) => animation.cancel());
        activeAnimations.current.clear();
    }, []);

    const prepare = useCallback(
        (onComplete: () => void) => {
            cancelAnimations();
            beforePositions.current = measure();
            completion.current = onComplete;
        },
        [cancelAnimations, measure],
    );

    useLayoutEffect(() => {
        const before = beforePositions.current;
        const onComplete = completion.current;

        if (!before || !onComplete) {
            return;
        }

        beforePositions.current = null;
        completion.current = null;

        const generation = ++animationGeneration.current;
        const after = measure();
        const finished: Promise<unknown>[] = [];

        if (!prefersReducedMotion()) {
            after.forEach((position, id) => {
                const previous = before.get(id);
                const node = nodes.current.get(id);

                if (!previous || !node) {
                    return;
                }

                const dx = previous.left - position.left;
                const dy = previous.top - position.top;

                if (dx === 0 && dy === 0) {
                    return;
                }

                activeAnimations.current.get(id)?.cancel();

                const animation = node.animate(
                    [
                        { transform: `translate(${dx}px, ${dy}px)` },
                        { transform: 'translate(0, 0)' },
                    ],
                    {
                        duration: 520,
                        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    },
                );

                activeAnimations.current.set(id, animation);
                finished.push(animation.finished.catch(() => undefined));
            });
        }

        void Promise.all(finished).then(() => {
            if (animationGeneration.current === generation) {
                activeAnimations.current.clear();
                onComplete();
            }
        });
    });

    const remove = useCallback((id: number, onComplete: () => void) => {
        const node = nodes.current.get(id);

        activeAnimations.current.get(id)?.cancel();

        if (!node || prefersReducedMotion()) {
            queueMicrotask(onComplete);

            return;
        }

        const generation = ++animationGeneration.current;
        const animation = node.animate(
            [
                { opacity: 1, transform: 'scale(1)' },
                { opacity: 0, transform: 'scale(0.98)' },
            ],
            {
                duration: 320,
                easing: 'cubic-bezier(0.4, 0, 1, 1)',
                fill: 'forwards',
            },
        );

        activeAnimations.current.set(id, animation);
        void animation.finished
            .then(() => {
                if (animationGeneration.current === generation) {
                    activeAnimations.current.delete(id);
                    onComplete();
                }
            })
            .catch(() => undefined);
    }, []);

    const register = useCallback((id: number, node: HTMLLIElement | null) => {
        if (node) {
            nodes.current.set(id, node);
        } else {
            nodes.current.delete(id);
        }
    }, []);

    useEffect(() => cancelAnimations, [cancelAnimations]);

    return { prepare, register, remove };
}

/**
 * A titled section of show rows ("Watch Next", "Haven't Started", "Watch
 * Later"), omitted entirely when it has nothing in it.
 */
function Section({
    label,
    rows,
    render,
}: {
    label: string;
    rows: ShowWatchRowData[];
    render: (row: ShowWatchRowData) => React.ReactNode;
}) {
    if (rows.length === 0) {
        return null;
    }

    return (
        <section>
            <div className="flex justify-center">
                <span className="rounded-full bg-muted px-3.5 py-1 text-xs font-semibold tracking-wider uppercase">
                    {label}
                </span>
            </div>
            <ul className="mt-3 space-y-3">{rows.map(render)}</ul>
        </section>
    );
}

export default function Shows({
    watchNext,
    haventStarted,
    watchLaterCount,
    watchLater,
}: {
    watchNext: ShowWatchRowData[];
    haventStarted: ShowWatchRowData[];
    watchLaterCount: number;
    // Optional prop: only present after the inline Watch Later section is revealed.
    watchLater?: ShowWatchRowData[];
}) {
    const [episodeModalId, setEpisodeModalId] = useState<number | null>(null);
    const [showModal, setShowModal] = useState<{
        showId: number;
        title: string;
    } | null>(null);
    // The row whose left-swipe status dialog is open, if any.
    const [statusRow, setStatusRow] = useState<ShowWatchRowData | null>(null);
    const [statusCovering, setStatusCovering] = useState<{
        id: number;
        start: number;
    } | null>(null);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const watchListAnchorRef = useRef<HTMLDivElement | null>(null);
    const watchListWrapperRef = useRef<HTMLDivElement | null>(null);
    const historyRef = useRef<WatchedHistoryHandle | null>(null);

    const [rows, setRows] = useState<ShowWatchRowData[]>(() => [
        ...watchNext,
        ...haventStarted,
    ]);
    const [mutation, setMutation] = useState<ActiveMutation | null>(null);
    const mutationRef = useRef<ActiveMutation | null>(null);
    const nextMutationGeneration = useRef(0);

    // The inline Watch Later section (revealed by the button, spec item 2).
    const [showWatchLater, setShowWatchLater] = useState(false);
    const [watchLaterRows, setWatchLaterRows] = useState<ShowWatchRowData[]>(
        watchLater ?? [],
    );
    // Mirrored so reconciliation reloads include the optional Watch Later prop
    // after that section has been revealed.
    const showWatchLaterRef = useRef(false);

    useEffect(() => {
        showWatchLaterRef.current = showWatchLater;
    }, [showWatchLater]);

    const {
        prepare: prepareFlip,
        register: registerFlip,
        remove: removeWithAnimation,
    } = useAuthoritativeFlip(watchListWrapperRef);
    const watchHttp = useHttp({ action: 'increment' as WatchAction });
    const statusHttp = useHttp({ status: '' });
    const removeHttp = useHttp({});
    const requestCancellationRef = useRef({
        watch: watchHttp.cancel,
        status: statusHttp.cancel,
        remove: removeHttp.cancel,
    });

    useEffect(() => {
        requestCancellationRef.current = {
            watch: watchHttp.cancel,
            status: statusHttp.cancel,
            remove: removeHttp.cancel,
        };
    }, [watchHttp.cancel, statusHttp.cancel, removeHttp.cancel]);

    const watchNextRows = rows.filter((row) => row.section === 'watch_next');
    const haventStartedRows = rows.filter(
        (row) => row.section === 'havent_started',
    );

    const hasWatchLaterSection = showWatchLater && watchLaterRows.length > 0;
    const showEmpty =
        rows.length === 0 && !hasWatchLaterSection && watchLaterCount === 0;

    const updateMutation = useCallback(
        (updater: (current: ActiveMutation) => ActiveMutation | null): void => {
            setMutation((current) => {
                if (current === null) {
                    return null;
                }

                const next = updater(current);

                mutationRef.current = next;

                return next;
            });
        },
        [],
    );

    const completeTransitionPart = useCallback(
        (part: 'movement' | 'overlay'): void => {
            updateMutation((current) => {
                const next = {
                    ...current,
                    movementComplete:
                        current.movementComplete || part === 'movement',
                    overlayComplete:
                        current.overlayComplete || part === 'overlay',
                };

                return next.phase === 'moving' &&
                    next.movementComplete &&
                    next.overlayComplete
                    ? null
                    : next;
            });
        },
        [updateMutation],
    );

    function reloadList(
        onSuccess?: (payload: WatchListPayload) => void,
        onError?: () => void,
    ) {
        const only = ['watchNext', 'haventStarted', 'watchLaterCount'];

        if (showWatchLaterRef.current) {
            only.push('watchLater');
        }

        router.reload({
            only,
            onSuccess: (page) => {
                const payload = page.props as unknown as WatchListPayload;

                if (mutationRef.current === null) {
                    setRows([...payload.watchNext, ...payload.haventStarted]);

                    if (payload.watchLater !== undefined) {
                        setWatchLaterRows(payload.watchLater);
                    }
                }

                onSuccess?.(payload);
            },
            onError,
        });
    }

    function revealWatchLater() {
        setShowWatchLater(true);
        router.reload({
            only: ['watchLater'],
            onSuccess: (page) => {
                const payload = page.props as unknown as WatchListPayload;

                setWatchLaterRows(payload.watchLater ?? []);
            },
        });
    }

    /**
     * Apply a left-swipe status action (spec Part 2 §2) to a show in either the
     * watching lists or the Watch Later section. Every option moves the show out
     * of its current list, so the row is dropped optimistically from both and
     * reconciled on finish (a reload fired alongside the mutation can race ahead
     * of the DB commit and re-add the row). "Remove" deletes the tracking row
     * only — the endpoint never touches watch history.
     */
    function applyStatusAction(row: ShowWatchRowData, action: StatusAction) {
        setStatusRow(null);
        router.flushAll();

        setRows((current) =>
            current.filter((item) => item.show_id !== row.show_id),
        );
        setWatchLaterRows((current) =>
            current.filter((item) => item.show_id !== row.show_id),
        );

        if (action === 'remove') {
            removeHttp.delete(removeFromList.url(row.show_id), {
                onFinish: () => reloadList(),
            });
        } else {
            const status = action === 'watch_later' ? 'watch_later' : 'stopped';

            statusHttp.transform(() => ({ status }));
            statusHttp.patch(setStatus.url(row.show_id), {
                onFinish: () => reloadList(),
            });
        }
    }

    function markWatched(row: ShowWatchRowData, sweepStart = 0) {
        if (mutationRef.current !== null || !row.episode) {
            return;
        }

        const generation = ++nextMutationGeneration.current;
        const activeMutation: ActiveMutation = {
            generation,
            showId: row.show_id,
            sweepStart,
            sweepComplete: prefersReducedMotion(),
            movementComplete: false,
            overlayComplete: false,
            phase: 'saving',
            authoritative: null,
        };

        mutationRef.current = activeMutation;
        setMutation(activeMutation);
        router.flushAll();

        const fail = () => {
            if (mutationRef.current?.generation === generation) {
                mutationRef.current = null;
                setMutation(null);
            }
        };

        watchHttp.transform(() => ({ action: 'increment' }));
        watchHttp.patch(toggleEpisode.url(row.episode.id), {
            onSuccess: () => {
                if (mutationRef.current?.generation !== generation) {
                    return;
                }

                historyRef.current?.recordWatch(row);
                updateMutation((current) => ({
                    ...current,
                    phase: 'reconciling',
                }));

                reloadList((authoritative) => {
                    if (mutationRef.current?.generation !== generation) {
                        return;
                    }

                    updateMutation((current) => ({
                        ...current,
                        authoritative,
                    }));
                }, fail);
            },
            onError: fail,
            onHttpException: fail,
            onNetworkError: fail,
        });
    }

    useEffect(() => {
        if (
            mutation === null ||
            mutation.phase !== 'reconciling' ||
            !mutation.sweepComplete ||
            mutation.authoritative === null
        ) {
            return;
        }

        const { authoritative, generation, showId } = mutation;
        const nextRows = [
            ...authoritative.watchNext,
            ...authoritative.haventStarted,
        ];
        const nextWatchLaterRows = authoritative.watchLater ?? [];
        const survives = [...nextRows, ...nextWatchLaterRows].some(
            (row) => row.show_id === showId,
        );

        const finishMovement = () => {
            if (mutationRef.current?.generation === generation) {
                completeTransitionPart('movement');
            }
        };

        const commitAuthoritativeRows = () => {
            if (mutationRef.current?.generation !== generation) {
                return;
            }

            prepareFlip(finishMovement);
            updateMutation((current) => ({
                ...current,
                phase: 'moving',
                overlayComplete: !survives || prefersReducedMotion(),
            }));
            setRows(nextRows);
            setWatchLaterRows(nextWatchLaterRows);
        };

        if (survives) {
            commitAuthoritativeRows();

            return;
        }

        updateMutation((current) => ({ ...current, phase: 'removing' }));
        removeWithAnimation(showId, commitAuthoritativeRows);
    }, [
        mutation,
        prepareFlip,
        removeWithAnimation,
        completeTransitionPart,
        updateMutation,
    ]);

    useEffect(() => {
        return () => {
            requestCancellationRef.current.watch();
            requestCancellationRef.current.status();
            requestCancellationRef.current.remove();
            mutationRef.current = null;
        };
    }, []);

    function openShow(row: ShowWatchRowData) {
        setShowModal({
            showId: row.show_id,
            title: row.show_title ?? 'Show',
        });
    }

    function handleModalClose(dirty: boolean) {
        setEpisodeModalId(null);
        setShowModal(null);

        if (dirty) {
            reloadList();
        }
    }

    function openStatusMenu(row: ShowWatchRowData, sweepStart: number) {
        if (statusCovering !== null) {
            return;
        }

        setStatusCovering({ id: row.show_id, start: sweepStart });
    }

    function statusSweep(row: ShowWatchRowData) {
        return statusCovering?.id === row.show_id ? (
            <div
                aria-hidden
                style={
                    {
                        '--sweep-start': statusCovering.start,
                    } as CSSProperties
                }
                onAnimationEnd={() => {
                    setStatusCovering(null);
                    setStatusRow(row);
                }}
                className="animate-status-sweep absolute inset-0 z-10 flex items-center justify-center bg-blue-500"
            >
                <EyeOff className="size-7 text-white" strokeWidth={2.5} />
            </div>
        ) : undefined;
    }

    function watchedSweep(row: ShowWatchRowData) {
        if (mutation?.showId !== row.show_id) {
            return statusSweep(row);
        }

        return (
            <div
                aria-hidden
                style={
                    {
                        '--sweep-start': mutation.sweepStart,
                    } as CSSProperties
                }
                onAnimationEnd={(event) => {
                    if (
                        event.target !== event.currentTarget ||
                        mutationRef.current?.generation !== mutation.generation
                    ) {
                        return;
                    }

                    if (event.animationName === 'watch-sweep') {
                        updateMutation((current) => ({
                            ...current,
                            sweepComplete: true,
                        }));
                    } else if (event.animationName === 'watch-sweep-out') {
                        completeTransitionPart('overlay');
                    }
                }}
                className={cn(
                    'absolute inset-0 z-10 flex items-center justify-center bg-emerald-500',
                    mutation.phase === 'moving'
                        ? 'animate-watch-sweep-out'
                        : 'animate-watch-sweep',
                )}
            >
                <Check className="size-7 text-white" strokeWidth={2.5} />
            </div>
        );
    }

    function renderRow(row: ShowWatchRowData) {
        return (
            <ShowWatchRow
                key={row.show_id}
                row={row}
                innerRef={(node) => registerFlip(row.show_id, node)}
                marking={mutation !== null}
                overlay={watchedSweep(row)}
                onMarkWatched={() => markWatched(row)}
                onOpenShow={() => openShow(row)}
                onOpenEpisode={setEpisodeModalId}
                swipe={{
                    onSwipeRight: (progress) => markWatched(row, progress),
                    rightEnabled: hasAired(row.episode),
                    onSwipeLeft: (progress) => openStatusMenu(row, progress),
                }}
            />
        );
    }

    function renderWatchLaterRow(row: ShowWatchRowData) {
        return (
            <ShowWatchRow
                key={row.show_id}
                row={row}
                innerRef={(node) => registerFlip(row.show_id, node)}
                marking={mutation !== null}
                overlay={watchedSweep(row)}
                onMarkWatched={() => markWatched(row)}
                onOpenShow={() => openShow(row)}
                onOpenEpisode={setEpisodeModalId}
                swipe={{
                    onSwipeRight: (progress) => markWatched(row, progress),
                    rightEnabled: hasAired(row.episode),
                    onSwipeLeft: (progress) => openStatusMenu(row, progress),
                }}
            />
        );
    }

    return (
        <>
            <Head title="Shows" />
            <div className="hidden md:block">
                <Heading
                    title="Shows"
                    description="What you're watching and what's next."
                />
            </div>
            <MediaSubTabs
                tabs={[
                    { title: 'Watch List', href: shows() },
                    { title: 'Upcoming', href: upcoming() },
                ]}
            />
            <PageScrollArea
                scrollRef={scrollRef}
                className="[overflow-anchor:none]"
            >
                <WatchedHistory
                    ref={historyRef}
                    scrollRef={scrollRef}
                    watchListAnchorRef={watchListAnchorRef}
                    onOpenShow={openShow}
                    onOpenEpisode={setEpisodeModalId}
                    onEpisodeUnwatched={() => reloadList()}
                />

                <div ref={watchListAnchorRef} aria-hidden />
                <div ref={watchListWrapperRef} className="min-h-full">
                    {showEmpty ? (
                        <EmptyState
                            icon={Tv}
                            title="Nothing to watch yet"
                            description="Track a show from Search and start marking episodes watched — your next episodes show up here."
                        />
                    ) : (
                        <div className="space-y-6">
                            <Section
                                label="Watch Next"
                                rows={watchNextRows}
                                render={renderRow}
                            />
                            <Section
                                label="Haven't Started"
                                rows={haventStartedRows}
                                render={renderRow}
                            />
                            {hasWatchLaterSection && (
                                <Section
                                    label="Watch Later"
                                    rows={watchLaterRows}
                                    render={renderWatchLaterRow}
                                />
                            )}
                        </div>
                    )}

                    {!showWatchLater && watchLaterCount > 0 && (
                        <div className="mt-6 flex justify-center">
                            <button
                                type="button"
                                onClick={revealWatchLater}
                                className="inline-flex items-center rounded-full border border-foreground/25 px-6 py-2.5 text-sm font-semibold tracking-wide uppercase transition-colors hover:border-foreground/60"
                            >
                                See Watch Later Shows
                            </button>
                        </div>
                    )}
                </div>
            </PageScrollArea>

            {episodeModalId !== null && (
                <EpisodeQuickViewModal
                    episodeId={episodeModalId}
                    onClose={handleModalClose}
                />
            )}
            {showModal !== null && (
                <ShowDetailModal
                    showId={showModal.showId}
                    title={showModal.title}
                    onClose={handleModalClose}
                />
            )}

            <ShowStatusSheet
                open={statusRow !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setStatusRow(null);
                    }
                }}
                showTitle={statusRow?.show_title ?? 'Show'}
                status={statusRow?.status ?? null}
                hasProgress={statusRow?.has_progress ?? false}
                onAction={(action) => {
                    if (statusRow) {
                        applyStatusAction(statusRow, action);
                    }
                }}
            />
        </>
    );
}
