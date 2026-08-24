import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { dayNames } from './types';
import type { ScheduleJob, ScheduleJobInput, ScheduleResource } from './types';

const emptyJob: ScheduleJobInput = {
    name: '',
    start_time: '00:00',
    duration_minutes: 60,
    weekdays: [0, 1, 2, 3, 4],
    resources: [],
    notes: '',
};

type Props = {
    open: boolean;
    job: ScheduleJob | null;
    resources: ScheduleResource[];
    error: string | null;
    saving: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (input: ScheduleJobInput) => Promise<void>;
    onDelete: (job: ScheduleJob) => Promise<void>;
};

export function JobEditor({
    open,
    job,
    resources,
    error,
    saving,
    onOpenChange,
    onSave,
    onDelete,
}: Props) {
    const [form, setForm] = useState<ScheduleJobInput>(() =>
        job
            ? {
                  ...job,
                  weekdays: [...job.weekdays],
                  resources: [...job.resources],
              }
            : { ...emptyJob },
    );

    function toggleDay(day: number) {
        setForm((current) => ({
            ...current,
            weekdays: current.weekdays.includes(day)
                ? current.weekdays.filter((item) => item !== day)
                : [...current.weekdays, day].sort(),
        }));
    }

    function toggleResource(resourceId: number) {
        setForm((current) => ({
            ...current,
            resources: current.resources.includes(resourceId)
                ? current.resources.filter((id) => id !== resourceId)
                : [...current.resources, resourceId],
        }));
    }

    async function submit(event: FormEvent) {
        event.preventDefault();
        await onSave({ ...form, notes: form.notes?.trim() || null });
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => !saving && onOpenChange(next)}
        >
            <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto border-slate-700 bg-slate-900 text-slate-100 sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{job ? 'Edit job' : 'Add job'}</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Schedule recurring work and assign it to one or more
                        resource lanes.
                    </DialogDescription>
                </DialogHeader>
                <form className="grid gap-5" onSubmit={submit}>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-1.5 text-sm font-medium">
                            Job name
                            <input
                                required
                                autoFocus
                                className="h-10 rounded-md border border-slate-600 bg-slate-950 px-3 text-slate-100 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                                value={form.name}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        name: event.target.value,
                                    })
                                }
                            />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="grid gap-1.5 text-sm font-medium">
                                Start time
                                <input
                                    required
                                    type="time"
                                    className="h-10 rounded-md border border-slate-600 bg-slate-950 px-3 font-mono text-slate-100 outline-none focus:border-amber-400"
                                    value={form.start_time}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            start_time: event.target.value,
                                        })
                                    }
                                />
                            </label>
                            <label className="grid gap-1.5 text-sm font-medium">
                                Minutes
                                <input
                                    required
                                    min="1"
                                    max="10080"
                                    type="number"
                                    className="h-10 rounded-md border border-slate-600 bg-slate-950 px-3 font-mono text-slate-100 outline-none focus:border-amber-400"
                                    value={form.duration_minutes}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            duration_minutes: Number(
                                                event.target.value,
                                            ),
                                        })
                                    }
                                />
                            </label>
                        </div>
                    </div>
                    <fieldset className="grid gap-2">
                        <legend className="text-sm font-medium">
                            Applicable days
                        </legend>
                        <div className="flex flex-wrap gap-2">
                            {[
                                ['Every day', [0, 1, 2, 3, 4, 5, 6]],
                                ['Weekdays', [0, 1, 2, 3, 4]],
                                ['Weekends', [5, 6]],
                            ].map(([label, days]) => (
                                <button
                                    key={label as string}
                                    className="rounded border border-slate-600 px-2 py-1 text-xs font-semibold text-amber-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-amber-400"
                                    type="button"
                                    onClick={() =>
                                        setForm({
                                            ...form,
                                            weekdays: days as number[],
                                        })
                                    }
                                >
                                    {label as string}
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                            {dayNames.map((day, index) => (
                                <button
                                    key={day}
                                    aria-pressed={form.weekdays.includes(index)}
                                    className={`h-10 rounded-md border text-xs font-bold ${form.weekdays.includes(index) ? 'border-amber-300 bg-amber-400 text-slate-950' : 'border-slate-600 bg-slate-950 text-slate-400'}`}
                                    type="button"
                                    onClick={() => toggleDay(index)}
                                >
                                    {day}
                                </button>
                            ))}
                        </div>
                    </fieldset>
                    <fieldset className="grid gap-2">
                        <legend className="text-sm font-medium">
                            Resources
                        </legend>
                        {resources.length === 0 ? (
                            <p className="rounded-md border border-dashed border-slate-700 p-3 text-sm text-slate-500">
                                Add resources before assigning this job.
                            </p>
                        ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {resources.map((resource) => (
                                    <label
                                        key={resource.id}
                                        className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-700 bg-slate-950/60 p-3 text-sm"
                                    >
                                        <input
                                            checked={form.resources.includes(
                                                resource.id,
                                            )}
                                            className="size-4 accent-amber-400"
                                            type="checkbox"
                                            onChange={() =>
                                                toggleResource(resource.id)
                                            }
                                        />
                                        <span>
                                            <span className="block font-medium">
                                                {resource.label}
                                            </span>
                                            {resource.subtitle && (
                                                <span className="block text-xs text-slate-500">
                                                    {resource.subtitle}
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </fieldset>
                    <label className="grid gap-1.5 text-sm font-medium">
                        Notes
                        <textarea
                            className="min-h-24 resize-y rounded-md border border-slate-600 bg-slate-950 p-3 text-slate-100 outline-none focus:border-amber-400"
                            placeholder="Runbook, dependencies, or handoff notes…"
                            value={form.notes ?? ''}
                            onChange={(event) =>
                                setForm({ ...form, notes: event.target.value })
                            }
                        />
                    </label>
                    {form.weekdays.length === 0 && (
                        <p className="text-sm text-pink-300" role="alert">
                            Select at least one day.
                        </p>
                    )}
                    {error && (
                        <p
                            className="rounded-md border border-pink-400/40 bg-pink-500/10 p-3 text-sm text-pink-200"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}
                    <DialogFooter className="sm:justify-between">
                        <div>
                            {job && (
                                <Button
                                    className="border-pink-500/50 text-pink-300 hover:bg-pink-500/10"
                                    disabled={saving}
                                    type="button"
                                    variant="outline"
                                    onClick={() => void onDelete(job)}
                                >
                                    <Trash2 /> Delete
                                </Button>
                            )}
                        </div>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            <Button
                                className="border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800"
                                disabled={saving}
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="bg-amber-400 text-slate-950 hover:bg-amber-300"
                                disabled={saving || form.weekdays.length === 0}
                                type="submit"
                            >
                                {saving ? 'Saving…' : 'Save job'}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
