import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The watched-toggle circle look (spec §9): white/outline = unwatched,
 * green/filled = watched. Purely presentational — callers own the state and
 * the request; EpisodeWatchedToggle wraps this for the self-contained case.
 */
export function WatchedCircle({
    watched,
    onToggle,
    label,
    className,
}: {
    watched: boolean;
    onToggle: () => void;
    label: string;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={watched}
            aria-label={
                watched ? `Mark ${label} unwatched` : `Mark ${label} watched`
            }
            className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors',
                watched
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-border bg-transparent text-muted-foreground/50 hover:border-foreground/40 hover:text-muted-foreground',
                className,
            )}
        >
            <Check className="size-5" strokeWidth={2.5} />
        </button>
    );
}
