import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { ScheduleJob, ScheduleResource } from './types';

type Props = {
    open: boolean;
    resources: ScheduleResource[];
    jobs: ScheduleJob[];
    busy: boolean;
    error: string | null;
    onOpenChange: (open: boolean) => void;
    onAdd: (label: string, subtitle: string) => Promise<void>;
    onUpdate: (resource: ScheduleResource) => Promise<void>;
    onDelete: (resource: ScheduleResource) => Promise<void>;
};

export function ResourceManager({
    open,
    resources,
    jobs,
    busy,
    error,
    onOpenChange,
    onAdd,
    onUpdate,
    onDelete,
}: Props) {
    const [drafts, setDrafts] = useState<ScheduleResource[]>(resources);
    const [label, setLabel] = useState('');
    const [subtitle, setSubtitle] = useState('');

    async function submit(event: FormEvent) {
        event.preventDefault();
        await onAdd(label, subtitle);
        setLabel('');
        setSubtitle('');
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => !busy && onOpenChange(next)}
        >
            <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto border-slate-700 bg-slate-900 text-slate-100 sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Manage resources</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Resource changes autosave when a field loses focus.
                        Deleting a resource removes its lane and job
                        assignments.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    {drafts.map((resource, index) => {
                        const usedBy = jobs.filter((job) =>
                            job.resources.includes(resource.id),
                        ).length;
                        const updateDraft = (
                            changes: Partial<ScheduleResource>,
                        ) =>
                            setDrafts((current) =>
                                current.map((item, itemIndex) =>
                                    itemIndex === index
                                        ? { ...item, ...changes }
                                        : item,
                                ),
                            );

                        return (
                            <div
                                key={resource.id}
                                className="grid gap-2 rounded-lg border border-slate-700 bg-slate-950/60 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                            >
                                <label className="grid gap-1 text-xs font-medium text-slate-400">
                                    Label
                                    <input
                                        required
                                        className="h-9 rounded-md border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-amber-400"
                                        value={resource.label}
                                        onChange={(event) =>
                                            updateDraft({
                                                label: event.target.value,
                                            })
                                        }
                                        onBlur={() =>
                                            resource.label.trim() &&
                                            void onUpdate({
                                                ...resource,
                                                label: resource.label.trim(),
                                            })
                                        }
                                    />
                                </label>
                                <label className="grid gap-1 text-xs font-medium text-slate-400">
                                    Subtitle
                                    <input
                                        className="h-9 rounded-md border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-amber-400"
                                        value={resource.subtitle ?? ''}
                                        onChange={(event) =>
                                            updateDraft({
                                                subtitle: event.target.value,
                                            })
                                        }
                                        onBlur={() =>
                                            void onUpdate({
                                                ...resource,
                                                subtitle:
                                                    resource.subtitle?.trim() ||
                                                    null,
                                            })
                                        }
                                    />
                                </label>
                                <Button
                                    aria-label={`Delete ${resource.label}; used by ${usedBy} jobs`}
                                    className="border-pink-500/40 text-pink-300 hover:bg-pink-500/10"
                                    disabled={busy}
                                    size="icon"
                                    type="button"
                                    variant="outline"
                                    onClick={() => void onDelete(resource)}
                                >
                                    <Trash2 />
                                </Button>
                            </div>
                        );
                    })}
                </div>
                <form
                    className="grid gap-3 rounded-lg border border-dashed border-slate-600 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                    onSubmit={submit}
                >
                    <label className="grid gap-1 text-xs font-medium text-slate-400">
                        New resource label
                        <input
                            required
                            className="h-9 rounded-md border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-amber-400"
                            value={label}
                            onChange={(event) => setLabel(event.target.value)}
                        />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-slate-400">
                        Subtitle
                        <input
                            className="h-9 rounded-md border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-amber-400"
                            value={subtitle}
                            onChange={(event) =>
                                setSubtitle(event.target.value)
                            }
                        />
                    </label>
                    <Button
                        className="bg-amber-400 text-slate-950 hover:bg-amber-300"
                        disabled={busy}
                        type="submit"
                    >
                        <Plus /> Add
                    </Button>
                </form>
                {error && (
                    <p
                        className="rounded-md border border-pink-400/40 bg-pink-500/10 p-3 text-sm text-pink-200"
                        role="alert"
                    >
                        {error}
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}
