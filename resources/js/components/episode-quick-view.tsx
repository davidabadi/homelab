import { ChevronLeft, ChevronRight, Play, Tv, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { formatLongDate, parseDateString } from '@/lib/dates';
import { cn } from '@/lib/utils';

export type QuickViewEpisode = {
    id: number;
    season_number: number;
    episode_number: number;
    title: string | null;
    still_url: string | null;
    overview: string | null;
    air_date: string | null;
    runtime_minutes: number | null;
};

export function episodeCode(episode: {
    season_number: number;
    episode_number: number;
}): string {
    const season = String(episode.season_number).padStart(2, '0');
    const number = String(episode.episode_number).padStart(2, '0');

    return `S${season} | E${number}`;
}

/**
 * The Episode Quick View dialog (spec §5), shared by the show detail modal
 * (episodes already in memory) and the standalone quick-view opened from
 * Shows › Upcoming (fetched per episode). Purely presentational — the host
 * owns watched state, the toggle control, and what previous/next means.
 *
 * Browsing: swipe left/right on touch screens, arrow keys or the edge
 * chevrons on larger screens. Position dots above the card show where the
 * episode sits in the show's run. Dismissed explicitly (X or Escape) —
 * clicking outside does not close it.
 */
export function EpisodeQuickView({
    open,
    onOpenChange,
    episode,
    showTitle,
    watched,
    watchCount = 0,
    watchedDate,
    toggle,
    hasPrevious,
    hasNext,
    onNavigate,
    position = null,
    total = null,
    elevated = false,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    episode: QuickViewEpisode | null;
    showTitle?: string | null;
    watched: boolean;
    watchCount?: number;
    watchedDate: string | null;
    toggle: React.ReactNode;
    hasPrevious: boolean;
    hasNext: boolean;
    onNavigate: (direction: 'previous' | 'next') => void;
    position?: number | null;
    total?: number | null;
    elevated?: boolean;
}) {
    const touchStartX = useRef<number | null>(null);
    // Remembered so the incoming episode slides in from the side you were
    // heading towards.
    const [lastDirection, setLastDirection] = useState<'previous' | 'next'>(
        'next',
    );

    function navigate(direction: 'previous' | 'next') {
        setLastDirection(direction);
        onNavigate(direction);
    }

    useEffect(() => {
        if (!open) {
            return;
        }

        function handleKeydown(event: KeyboardEvent) {
            if (event.key === 'ArrowLeft' && hasPrevious) {
                navigate('previous');
            }

            if (event.key === 'ArrowRight' && hasNext) {
                navigate('next');
            }
        }

        window.addEventListener('keydown', handleKeydown);

        return () => window.removeEventListener('keydown', handleKeydown);
        // `navigate` only wraps the onNavigate prop with a ref write.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, hasPrevious, hasNext, onNavigate]);

    function handleTouchStart(event: React.TouchEvent) {
        touchStartX.current = event.touches[0].clientX;
    }

    function handleTouchEnd(event: React.TouchEvent) {
        if (touchStartX.current === null) {
            return;
        }

        const deltaX = event.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;

        if (Math.abs(deltaX) < 60) {
            return;
        }

        if (deltaX > 0 && hasPrevious) {
            navigate('previous');
        } else if (deltaX < 0 && hasNext) {
            navigate('next');
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                overlayClassName={elevated ? 'z-[70]' : undefined}
                className={cn('max-w-md', elevated && 'z-[70]')}
                showCloseButton={false}
                onInteractOutside={(event) => event.preventDefault()}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                <PositionDots position={position} total={total} />
                <NavigationChevron
                    direction="previous"
                    enabled={hasPrevious}
                    onNavigate={navigate}
                />
                <NavigationChevron
                    direction="next"
                    enabled={hasNext}
                    onNavigate={navigate}
                />
                <DialogClose
                    aria-label="Close"
                    className="absolute top-3 right-3 z-10 flex size-9 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                >
                    <X className="size-5" />
                </DialogClose>

                {episode === null ? (
                    <div className="animate-pulse space-y-4">
                        <div className="aspect-video w-full rounded-lg bg-muted" />
                        <div className="h-5 w-2/3 rounded bg-muted" />
                        <div className="h-16 rounded bg-muted" />
                    </div>
                ) : (
                    <div
                        // Re-keying restarts the entrance animation per
                        // episode, sliding in from the direction of travel.
                        key={episode.id}
                        className={cn(
                            'grid animate-in gap-4 duration-300 fade-in',
                            lastDirection === 'next'
                                ? 'slide-in-from-right-8'
                                : 'slide-in-from-left-8',
                        )}
                    >
                        {episode.still_url ? (
                            <img
                                src={episode.still_url}
                                alt=""
                                className="aspect-video w-full rounded-lg object-cover"
                            />
                        ) : (
                            <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-muted">
                                <Tv className="size-5 text-muted-foreground" />
                            </div>
                        )}
                        <DialogHeader className="text-left">
                            {showTitle && (
                                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                    {showTitle}
                                </p>
                            )}
                            <DialogTitle>
                                <span className="mr-2 text-muted-foreground">
                                    {episodeCode(episode)}
                                </span>
                                {episode.title ?? 'TBA'}
                            </DialogTitle>
                            <DialogDescription className="whitespace-pre-line">
                                {episode.overview ?? 'No overview available.'}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                                <Play className="size-3.5" />
                                {episode.air_date
                                    ? formatLongDate(
                                          parseDateString(episode.air_date),
                                      )
                                    : 'Air date TBA'}
                                {episode.runtime_minutes !== null &&
                                    episode.runtime_minutes > 0 &&
                                    ` · ${episode.runtime_minutes} min`}
                            </span>
                            <div className="flex items-center gap-2.5">
                                <span>
                                    {watched
                                        ? `${`Watched ${
                                              watchedDate
                                                  ? formatLongDate(
                                                        parseDateString(
                                                            watchedDate,
                                                        ),
                                                    )
                                                  : ''
                                          }`.trim()}${watchCount > 1 ? ` · ${watchCount}×` : ''}`
                                        : 'Not watched'}
                                </span>
                                {toggle}
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

/** Horizontal pixels each dot occupies in the strip. */
const DOT_SLOT = 20;
/** How many dot slots the clipped viewport shows. */
const DOTS_VISIBLE = 5;

/**
 * Position dots above the dialog, animated like a carousel indicator: on
 * navigation the highlight first hops to the neighboring dot, then the whole
 * strip slides so the active dot sits centered again. Implemented as one dot
 * per episode on a translated row inside a clipping viewport — the
 * re-centering lags the highlight by a beat, which is what makes the two
 * movements readable.
 */
function PositionDots({
    position,
    total,
}: {
    position: number | null;
    total: number | null;
}) {
    // The dot the strip is centered on deliberately trails the active one.
    const [centered, setCentered] = useState(position ?? 0);

    useEffect(() => {
        if (position === null || position === centered) {
            return;
        }

        const handle = setTimeout(() => setCentered(position), 280);

        return () => clearTimeout(handle);
    }, [position, centered]);

    if (position === null || total === null || total < 2) {
        return null;
    }

    const visible = Math.min(DOTS_VISIBLE, total);
    // Clamped so the strip never slides past its ends — near the edges the
    // active dot sits off-center, like every carousel indicator.
    const start = Math.max(
        0,
        Math.min(centered - Math.floor(visible / 2), total - visible),
    );

    // Only dots near the viewport need to be in the DOM; a few beyond each
    // edge keep the slide seamless.
    const firstRendered = Math.max(0, start - 3);
    const lastRendered = Math.min(total - 1, start + visible + 2);
    const dots = Array.from(
        { length: lastRendered - firstRendered + 1 },
        (_, i) => firstRendered + i,
    );

    return (
        <div
            aria-hidden="true"
            className="absolute -top-8 left-1/2 -translate-x-1/2 overflow-hidden"
            style={{ width: visible * DOT_SLOT }}
        >
            <div
                className="relative h-4 transition-transform duration-300 ease-out"
                style={{ transform: `translateX(${-start * DOT_SLOT}px)` }}
            >
                {dots.map((index) => (
                    <span
                        key={index}
                        className={cn(
                            'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-200 ease-out',
                            index === position
                                ? 'size-3 bg-emerald-400'
                                : 'size-2 bg-muted-foreground/50',
                        )}
                        style={{ left: index * DOT_SLOT + DOT_SLOT / 2 }}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * Edge chevrons for larger screens (touch screens swipe instead). Rendered
 * just outside the dialog card so they don't overlap content.
 */
function NavigationChevron({
    direction,
    enabled,
    onNavigate,
}: {
    direction: 'previous' | 'next';
    enabled: boolean;
    onNavigate: (direction: 'previous' | 'next') => void;
}) {
    if (!enabled) {
        return null;
    }

    const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;

    return (
        <button
            type="button"
            onClick={() => onNavigate(direction)}
            aria-label={
                direction === 'previous' ? 'Previous episode' : 'Next episode'
            }
            className={cn(
                'absolute top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground md:flex',
                direction === 'previous'
                    ? 'left-0 -translate-x-1/2 md:-translate-x-[130%]'
                    : 'right-0 translate-x-1/2 md:translate-x-[130%]',
            )}
        >
            <Icon className="size-5" />
        </button>
    );
}
