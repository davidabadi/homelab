import { useState } from 'react';
import { MultiWatchSheet } from '@/components/multi-watch-sheet';
import { WatchedToggle } from '@/components/watched-toggle';
import type { WatchAction } from '@/components/watched-toggle';

/**
 * The multi-watch toggle + sheet combo, wired to a single funnel (`onAction`)
 * that the host handles however it needs (optimistic state, HTTP, catch-up
 * interception). Tapping an unwatched item fires `increment` straight away;
 * tapping an already-watched item opens the shared action sheet. Controlled —
 * the host owns `count`.
 */
export function MediaWatchControl({
    count,
    label,
    onAction,
    disabled = false,
    className,
    elevated = false,
}: {
    count: number;
    label: string;
    onAction: (action: WatchAction) => void;
    disabled?: boolean;
    className?: string;
    elevated?: boolean;
}) {
    const [sheetOpen, setSheetOpen] = useState(false);

    function handleTap() {
        if (disabled) {
            return;
        }

        if (count === 0) {
            // Unwatched → mark watched (0 → 1) directly, no sheet.
            onAction('increment');

            return;
        }

        setSheetOpen(true);
    }

    return (
        <>
            <WatchedToggle
                count={count}
                onTap={handleTap}
                label={label}
                className={className}
            />
            <MultiWatchSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                count={count}
                label={label}
                elevated={elevated}
                onAction={(action) => {
                    setSheetOpen(false);
                    onAction(action);
                }}
            />
        </>
    );
}
