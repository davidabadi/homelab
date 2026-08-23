import { Check, Eye, RotateCcw, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { WatchAction } from '@/components/watched-toggle';
import { cn } from '@/lib/utils';

type Option = {
    action: WatchAction;
    label: string;
    icon: LucideIcon;
    tone?: 'default' | 'destructive';
};

/**
 * The shared multi-watch action sheet (spec §10 item 6, extended): opened when
 * tapping an already-watched episode or movie. An item watched once offers
 * "watched again" or "not watched"; watched more than once adds "watched only
 * once" so a run of rewatches can be collapsed back to a single watch. Used by
 * both the Shows and Movies watch lists, the Upcoming screens, and the detail
 * modals — every watched-toggle in the app funnels through here.
 */
export function MultiWatchSheet({
    open,
    onOpenChange,
    count,
    label,
    onAction,
    elevated = false,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    count: number;
    label: string;
    onAction: (action: WatchAction) => void;
    elevated?: boolean;
}) {
    const options: Option[] = [
        { action: 'increment', label: 'Mark watched again', icon: Eye },
        ...(count > 1
            ? [
                  {
                      action: 'set_once' as const,
                      label: 'Mark as watched only once',
                      icon: Check,
                  },
              ]
            : []),
        {
            action: 'reset',
            label: 'Mark as not watched',
            icon: RotateCcw,
            tone: 'destructive' as const,
        },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                overlayClassName={elevated ? 'z-[70]' : undefined}
                className={cn(
                    'gap-0 overflow-hidden p-0 sm:max-w-sm',
                    elevated && 'z-[70]',
                )}
            >
                <DialogHeader className="px-5 pt-5 pb-4 text-left">
                    <DialogTitle className="truncate">{label}</DialogTitle>
                    <DialogDescription>
                        Watched {count} {count === 1 ? 'time' : 'times'}
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
                                option.tone === 'destructive'
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
                        <X className="size-4 shrink-0" />
                        Cancel
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
