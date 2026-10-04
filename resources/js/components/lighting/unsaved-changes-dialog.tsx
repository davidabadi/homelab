import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { LightingEditorController } from './use-lighting-editor';

export function SaveConflictAlert({
    editor,
}: {
    editor: LightingEditorController;
}) {
    if (!editor.conflict) {
        return null;
    }

    return (
        <div
            className="flex flex-wrap items-center gap-3 border-b bg-destructive/5 px-4 py-2 text-sm"
            role="alert"
        >
            <CircleAlert className="size-4 text-destructive" />
            <span>
                Another tab changed this design. Your local layout is still
                here.
            </span>
            <Button
                size="sm"
                disabled={editor.busy}
                onClick={editor.reloadSaved}
            >
                Reload saved design
            </Button>
            <Button
                size="sm"
                disabled={editor.busy}
                variant="outline"
                onClick={() => void editor.saveAsNewDesign()}
            >
                Save as new design
            </Button>
        </div>
    );
}

export function UnsavedChangesDialog({
    editor,
}: {
    editor: LightingEditorController;
}) {
    return (
        <Dialog open={editor.leaveDialog} onOpenChange={editor.setLeaveDialog}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Unsaved panel changes</DialogTitle>
                    <DialogDescription>
                        The design could not be saved. Stay to retry, save the
                        local layout as a new design, or explicitly discard
                        these changes.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex-wrap">
                    <Button variant="outline" onClick={editor.stayInEditor}>
                        Stay
                    </Button>
                    <Button
                        variant="outline"
                        disabled={editor.busy}
                        onClick={() => void editor.saveAsNewDesign()}
                    >
                        Save as new design
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={editor.discardAndLeave}
                    >
                        Discard and leave
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
