import { Clock, EyeOff, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ShowRowStatus } from '@/components/show-watch-row';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type StatusAction = 'watch_later' | 'stop_watching' | 'remove';

type Option = {
    action: StatusAction;
    label: string;
    icon: LucideIcon;
    destructive?: boolean;
};

const WATCH_LATER: Option = {
    action: 'watch_later',
    label: 'Watch later',
    icon: Clock,
};
const STOP_WATCHING: Option = {
    action: 'stop_watching',
    label: 'Stop watching',
    icon: EyeOff,
};
const REMOVE: Option = {
    action: 'remove',
    label: 'Remove',
    icon: Trash2,
    destructive: true,
};

/**
 * The options a left-swipe offers, per the exact status × progress matrix
 * (spec Part 2 §2) — no other combinations. "Remove" (which deletes the
 * tracking row) is only ever offered when the show has no watched episodes, so
 * progress is never at risk.
 */
function optionsFor(
    status: ShowRowStatus | null,
    hasProgress: boolean,
): Option[] {
    if (status === 'watching') {
        return hasProgress
            ? [WATCH_LATER, STOP_WATCHING]
            : [WATCH_LATER, REMOVE];
    }

    if (status === 'watch_later') {
        return hasProgress ? [STOP_WATCHING] : [REMOVE];
    }

    return [];
}

/**
 * The left-swipe status action dialog (spec Part 2 §2): options depend on the
 * show's current status crossed with whether it has any watched episode.
 * "Watch Later" / "Stop Watching" move the status; "Remove" drops the tracking
 * row (history preserved). A dialog (not a bottom sheet) to stay consistent with
 * the multi-watch action dialog used elsewhere.
 */
export function ShowStatusSheet({
    open,
    onOpenChange,
    showTitle,
    status,
    hasProgress,
    onAction,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    showTitle: string;
    status: ShowRowStatus | null;
    hasProgress: boolean;
    onAction: (action: StatusAction) => void;
}) {
    const options = optionsFor(status, hasProgress);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="gap-0 overflow-hidden p-0 sm:max-w-sm"
            >
                <DialogHeader className="px-5 pt-5 pb-4 text-left">
                    <DialogTitle className="truncate">{showTitle}</DialogTitle>
                    <DialogDescription>
                        Move this show or take it off your list.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col border-t border-border/60">
                    {options.map((option) => (
                        <button
                            key={option.action}
                            type="button"
                            onClick={() => onAction(option.action)}
                            className={cn(
                                'flex items-center gap-3 px-5 py-3.5 text-left text-sm font-medium transition-colors hover:bg-muted',
                                option.destructive
                                    ? 'text-red-500'
                                    : 'text-foreground',
                            )}
                        >
                            <option.icon className="size-4 shrink-0" />
                            {option.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="flex items-center gap-3 border-t border-border/60 px-5 py-3.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                    >
                        <span className="size-4 shrink-0" />
                        Cancel
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export type { StatusAction };
