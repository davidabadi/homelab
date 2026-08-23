import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

/**
 * A small yes/no confirmation dialog for actions that lose state (e.g.
 * untracking, which also resets watched progress). Dismissing the dialog by
 * any means other than the confirm button is a "no".
 */
export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel = 'Cancel',
    destructive = false,
    onConfirm,
    onOpenChange,
    elevated = false,
}: {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
    elevated?: boolean;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* No corner X — the explicit buttons below are the only actions. */}
            <DialogContent
                className={elevated ? 'z-[70] max-w-sm' : 'max-w-sm'}
                overlayClassName={elevated ? 'z-[70]' : undefined}
                showCloseButton={false}
            >
                <DialogHeader className="text-left">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={destructive ? 'destructive' : 'default'}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
