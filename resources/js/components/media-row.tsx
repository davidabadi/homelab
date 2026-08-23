import { Check, ChevronRight, EyeOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A small status pill on a media row (spec §5): NEW / PREMIERE / LATEST for
 * shows that are new, a season opener, or caught up to the latest episode.
 */
export type RowBadgeTone = 'new' | 'premiere' | 'latest';

const BADGE_TONES: Record<RowBadgeTone, string> = {
    new: 'bg-yellow-400 text-black',
    premiere: 'bg-white text-black',
    latest: 'bg-white text-black',
};

/**
 * Swipe wiring for a row (spec Part 2 §1/§2): right-swipe is the fast
 * "increment watch count" gesture (only when the surfaced episode has aired,
 * `rightEnabled`); left-swipe reveals the show's status menu. Omit entirely and
 * the row isn't swipeable (Upcoming, Watched History).
 */
export type RowSwipe = {
    onSwipeRight?: (progress: number) => void;
    rightEnabled?: boolean;
    onSwipeLeft?: (progress: number) => void;
};

// Releasing commits once the row has traveled this share of its own width.
const COMMIT_THRESHOLD_RATIO = 0.4;

type DragState = {
    x: number;
    y: number;
    width: number;
    locked: boolean;
};

/**
 * Horizontal swipe gesture for a single row. Relies on `touch-action: pan-y` to
 * hand vertical scrolling back to the browser (which fires pointercancel when it
 * takes over), so this only ever has to reason about the horizontal axis. Right
 * pulls are clamped away entirely when `rightEnabled` is false, and left pulls
 * when there's no left handler, so the reveal never promises an action that
 * can't fire.
 */
function useRowSwipe(swipe: RowSwipe | undefined) {
    const [dx, setDx] = useState(0);
    const [gestureWidth, setGestureWidth] = useState(0);
    const [settling, setSettling] = useState(false);
    const drag = useRef<DragState | null>(null);
    // The current offset, mirrored synchronously so release() reads the true
    // final position rather than a React state value that may not have flushed
    // between the last pointermove and pointerup on a fast swipe.
    const offset = useRef(0);
    // Set once a gesture crosses into a real horizontal drag, so the click that
    // follows pointerup (opening the episode) is suppressed.
    const swiped = useRef(false);

    const rightEnabled = swipe?.rightEnabled ?? swipe?.onSwipeRight != null;
    const leftEnabled = swipe?.onSwipeLeft != null;
    const enabled = Boolean(swipe && (rightEnabled || leftEnabled));

    function clamp(value: number, width: number): number {
        let next = value;

        if (next > 0 && !rightEnabled) {
            next = 0;
        }

        if (next < 0 && !leftEnabled) {
            next = 0;
        }

        return Math.max(-width, Math.min(width, next));
    }

    function onPointerDown(event: React.PointerEvent) {
        if (!enabled || event.pointerType === 'mouse') {
            return;
        }

        const width = event.currentTarget.getBoundingClientRect().width;

        drag.current = {
            x: event.clientX,
            y: event.clientY,
            width,
            locked: false,
        };
        setGestureWidth(width);
        // Clear last gesture's flag now: a touch swipe often fires no trailing
        // click to consume it, and a stale flag would eat the next real tap.
        swiped.current = false;
        setSettling(false);
    }

    function onPointerMove(event: React.PointerEvent) {
        const state = drag.current;

        if (!state) {
            return;
        }

        const moveX = event.clientX - state.x;
        const moveY = event.clientY - state.y;

        if (!state.locked) {
            // Let a vertical intent fall through to the scroller.
            if (Math.abs(moveY) > Math.abs(moveX) && Math.abs(moveY) > 8) {
                drag.current = null;

                return;
            }

            if (Math.abs(moveX) > 8) {
                state.locked = true;
                swiped.current = true;

                // Keep receiving moves even if the finger leaves the row.
                // Can throw if the pointer is already gone — harmless.
                try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                    // ignore
                }
            } else {
                return;
            }
        }

        const next = clamp(moveX, state.width);
        offset.current = next;
        setDx(next);
    }

    function release() {
        if (!drag.current) {
            return;
        }

        const committed = offset.current;
        const width = drag.current.width;
        const commitThreshold = width * COMMIT_THRESHOLD_RATIO;
        const progress = Math.min(1, Math.abs(committed) / width);

        drag.current = null;
        offset.current = 0;
        setSettling(true);
        setDx(0);

        if (committed >= commitThreshold) {
            swipe?.onSwipeRight?.(progress);
        } else if (committed <= -commitThreshold) {
            swipe?.onSwipeLeft?.(progress);
        }
    }

    function onPointerCancel() {
        if (!drag.current && offset.current === 0) {
            return;
        }

        drag.current = null;
        offset.current = 0;
        setSettling(true);
        setDx(0);
    }

    // Swallow the click that a committed/handled swipe leaves behind, once.
    function guardClick(): boolean {
        if (swiped.current) {
            swiped.current = false;

            return true;
        }

        return false;
    }

    return {
        enabled,
        dx,
        gestureWidth,
        settling,
        rightEnabled,
        handlers: enabled
            ? {
                  onPointerDown,
                  onPointerMove,
                  onPointerUp: release,
                  onPointerCancel,
              }
            : {},
        guardClick,
    };
}

/**
 * The shared media list row (spec §5), the single implementation behind the
 * Upcoming screens and the Shows Watch List — a poster thumb, a tappable
 * name pill, an `S## | E##` line (with an optional "+N remaining" count and
 * status badge), a subtitle, and a trailing control (watched-toggle or
 * countdown). Purely presentational; the host supplies the trailing control
 * and the tap handlers.
 *
 * Optionally swipeable (`swipe`): the content layer slides over a reveal panel —
 * green "watched" on a right pull, blue "menu" on a left pull.
 */
export function MediaRow({
    posterUrl,
    fallbackIcon: FallbackIcon,
    pill,
    primary,
    primarySuffix,
    secondary,
    badge,
    onClick,
    trailing,
    innerRef,
    overlay,
    className,
    swipe,
}: {
    posterUrl: string | null;
    fallbackIcon: LucideIcon;
    pill?: { label: string; onClick: () => void };
    primary: string;
    primarySuffix?: string | null;
    secondary?: string | null;
    badge?: { label: string; tone: RowBadgeTone } | null;
    onClick?: () => void;
    trailing: React.ReactNode;
    innerRef?: React.Ref<HTMLLIElement>;
    overlay?: React.ReactNode;
    className?: string;
    swipe?: RowSwipe;
}) {
    const { enabled, dx, gestureWidth, settling, handlers, guardClick } =
        useRowSwipe(swipe);

    const commitThreshold = gestureWidth * COMMIT_THRESHOLD_RATIO;
    const revealIntensity = commitThreshold
        ? Math.min(1, Math.abs(dx) / commitThreshold)
        : 0;

    function handleClick() {
        if (guardClick()) {
            return;
        }

        onClick?.();
    }

    return (
        <li
            ref={innerRef}
            className={cn(
                'relative overflow-hidden rounded-xl bg-surface',
                className,
            )}
        >
            {enabled && dx > 0 && (
                <div
                    aria-hidden
                    className="absolute inset-0 flex items-center justify-start bg-emerald-500 pl-7"
                    style={{ opacity: revealIntensity }}
                >
                    <Check className="size-6 text-white" strokeWidth={2.5} />
                </div>
            )}
            {enabled && dx < 0 && (
                <div
                    aria-hidden
                    className="absolute inset-0 flex items-center justify-end bg-blue-500 pr-7"
                    style={{ opacity: revealIntensity }}
                >
                    <EyeOff className="size-6 text-white" strokeWidth={2.5} />
                </div>
            )}

            <div
                onClick={handleClick}
                {...handlers}
                style={
                    enabled
                        ? {
                              transform: `translateX(${dx}px)`,
                              transition: settling
                                  ? 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)'
                                  : 'none',
                              touchAction: 'pan-y',
                          }
                        : undefined
                }
                className={cn(
                    'relative flex items-stretch bg-surface transition-colors',
                    onClick && 'cursor-pointer hover:brightness-110',
                )}
            >
                {posterUrl ? (
                    <img
                        src={posterUrl}
                        alt=""
                        className="aspect-2/3 w-20 shrink-0 object-cover"
                        draggable={false}
                    />
                ) : (
                    <div className="flex aspect-2/3 w-20 shrink-0 items-center justify-center bg-muted">
                        <FallbackIcon className="size-6 text-muted-foreground" />
                    </div>
                )}
                <div className="flex min-w-0 flex-1 items-center gap-3 p-3.5">
                    <div className="min-w-0 flex-1 space-y-1">
                        {pill && (
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    pill.onClick();
                                }}
                                className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-foreground/25 py-0.5 pr-1.5 pl-3 text-xs font-semibold tracking-wide uppercase transition-colors hover:border-foreground/60"
                            >
                                <span className="truncate">{pill.label}</span>
                                <ChevronRight className="size-3.5 shrink-0" />
                            </button>
                        )}
                        <p className="text-base font-semibold">
                            {primary}
                            {primarySuffix && (
                                <span className="ml-1.5 align-middle text-xs font-semibold text-muted-foreground">
                                    {primarySuffix}
                                </span>
                            )}
                        </p>
                        {secondary && (
                            <p className="truncate text-sm text-muted-foreground">
                                {secondary}
                            </p>
                        )}
                        {badge && (
                            <span
                                className={cn(
                                    'inline-flex rounded px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase',
                                    BADGE_TONES[badge.tone],
                                )}
                            >
                                {badge.label}
                            </span>
                        )}
                    </div>
                    <span onClick={(event) => event.stopPropagation()}>
                        {trailing}
                    </span>
                </div>
            </div>
            {overlay}
        </li>
    );
}
