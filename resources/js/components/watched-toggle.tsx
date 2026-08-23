import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A watched-toggle intent (spec §10 item 6, extended): watched status is a count
 * now, not a boolean, so a tap can mean three different things. Mirrors
 * App\Enums\WatchAction.
 */
export type WatchAction = 'increment' | 'set_once' | 'reset';

/** The watch count after applying an action, for optimistic UI updates. */
export function nextWatchCount(count: number, action: WatchAction): number {
    switch (action) {
        case 'increment':
            return count + 1;
        case 'set_once':
            return 1;
        case 'reset':
            return 0;
    }
}

/**
 * The count-aware watched circle (spec §9, extended): empty when unwatched, a
 * green check at one watch, and "×N" once it's been watched more than once.
 * Purely presentational — the caller owns the tap behaviour (a bare mark, or
 * opening the multi-watch sheet).
 */
export function WatchedToggle({
    count,
    onTap,
    label,
    className,
}: {
    count: number;
    onTap: () => void;
    label: string;
    className?: string;
}) {
    const watched = count > 0;
    const [showActivationFeedback, setShowActivationFeedback] = useState(false);
    const visuallyWatched = watched || showActivationFeedback;

    useEffect(() => {
        if (!showActivationFeedback) {
            return;
        }

        const timeout = window.setTimeout(() => {
            setShowActivationFeedback(false);
        }, 700);

        return () => window.clearTimeout(timeout);
    }, [showActivationFeedback]);

    function handleTap() {
        if (!watched) {
            setShowActivationFeedback(true);
        }

        onTap();
    }

    return (
        <button
            type="button"
            onClick={handleTap}
            aria-pressed={visuallyWatched}
            aria-label={
                visuallyWatched
                    ? `Change watched status for ${label}`
                    : `Mark ${label} watched`
            }
            className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-[color,background-color,border-color,transform]',
                visuallyWatched
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-border bg-transparent text-muted-foreground/50 hover:border-foreground/40 hover:text-muted-foreground',
                showActivationFeedback && 'animate-watched-toggle',
                className,
            )}
        >
            {count > 1 ? (
                <span className="tabular-nums">×{count}</span>
            ) : (
                <Check className="size-5" strokeWidth={2.5} />
            )}
        </button>
    );
}
