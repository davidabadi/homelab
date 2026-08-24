import { CircleAlert, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type {
    PresenceTrip,
    PresenceTripInput,
} from '@/components/presence/types';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { dateInputForYear, overlappingTrips } from '@/lib/presence';

type Props = {
    open: boolean;
    trip: PresenceTrip | null;
    trips: PresenceTrip[];
    selectedYear: number;
    today: string;
    error: string | null;
    saving: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (input: PresenceTripInput) => Promise<void>;
    onDelete: (trip: PresenceTrip) => Promise<void>;
};

export function TripEditor({
    open,
    trip,
    trips,
    selectedYear,
    today,
    error,
    saving,
    onOpenChange,
    onSave,
    onDelete,
}: Props) {
    const initialDate = dateInputForYear(selectedYear, today);
    const [form, setForm] = useState<PresenceTripInput>(() =>
        trip
            ? {
                  entry_date: trip.entry_date,
                  exit_date: trip.exit_date,
                  status: trip.status,
                  notes: trip.notes,
              }
            : {
                  entry_date: initialDate,
                  exit_date: initialDate,
                  status: initialDate > today ? 'planned' : 'confirmed',
                  notes: '',
              },
    );
    const overlaps = useMemo(
        () => overlappingTrips(form, trips, trip?.id ?? null),
        [form, trip?.id, trips],
    );
    const incomplete =
        !form.entry_date || !form.exit_date || form.exit_date < form.entry_date;

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        await onSave({ ...form, notes: form.notes?.trim() || null });
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => !saving && onOpenChange(next)}
        >
            <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto border-emerald-950/15 bg-stone-50 p-5 text-stone-900 sm:max-w-xl sm:p-6 dark:border-emerald-300/20 dark:bg-stone-950 dark:text-stone-100">
                <DialogHeader>
                    <DialogTitle>{trip ? 'Edit trip' : 'Add trip'}</DialogTitle>
                    <DialogDescription>
                        Dates are calendar dates. Entry and departure both count
                        as U.S. days.
                    </DialogDescription>
                </DialogHeader>
                <form className="grid gap-5" onSubmit={submit}>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-1.5 text-sm font-medium">
                            Entry date
                            <input
                                required
                                aria-invalid={!form.entry_date}
                                className="h-11 rounded-lg border border-stone-300 bg-white px-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 dark:border-stone-700 dark:bg-stone-900"
                                type="date"
                                value={form.entry_date}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        entry_date: event.target.value,
                                    })
                                }
                            />
                        </label>
                        <label className="grid gap-1.5 text-sm font-medium">
                            Scheduled departure date
                            <input
                                required
                                aria-invalid={
                                    !form.exit_date ||
                                    form.exit_date < form.entry_date
                                }
                                className="h-11 rounded-lg border border-stone-300 bg-white px-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 dark:border-stone-700 dark:bg-stone-900"
                                min={form.entry_date}
                                type="date"
                                value={form.exit_date}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        exit_date: event.target.value,
                                    })
                                }
                            />
                        </label>
                    </div>
                    <fieldset className="grid gap-2">
                        <legend className="text-sm font-medium">
                            Trip status
                        </legend>
                        <div className="grid grid-cols-2 gap-2">
                            {(['confirmed', 'planned'] as const).map(
                                (status) => (
                                    <label
                                        key={status}
                                        className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm font-semibold ${form.status === status ? 'border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900'}`}
                                    >
                                        <input
                                            checked={form.status === status}
                                            className="accent-emerald-700"
                                            name="trip-status"
                                            type="radio"
                                            onChange={() =>
                                                setForm({ ...form, status })
                                            }
                                        />
                                        {status === 'confirmed'
                                            ? 'Confirmed'
                                            : 'Planned'}
                                    </label>
                                ),
                            )}
                        </div>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                            Confirming a plan makes it eligible for actual
                            elapsed-day counting.
                        </p>
                    </fieldset>
                    <label className="grid gap-1.5 text-sm font-medium">
                        Notes
                        <textarea
                            className="min-h-24 resize-y rounded-lg border border-stone-300 bg-white p-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 dark:border-stone-700 dark:bg-stone-900"
                            maxLength={5000}
                            placeholder="Flight, purpose, or anything useful later…"
                            value={form.notes ?? ''}
                            onChange={(event) =>
                                setForm({ ...form, notes: event.target.value })
                            }
                        />
                    </label>
                    {incomplete && (
                        <p
                            className="flex gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                            role="alert"
                        >
                            <CircleAlert className="mt-0.5 size-4 shrink-0" />
                            Complete both dates and keep departure on or after
                            entry.
                        </p>
                    )}
                    {overlaps.length > 0 && (
                        <p
                            className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200"
                            role="alert"
                        >
                            <CircleAlert className="mt-0.5 size-4 shrink-0" />
                            This overlaps {overlaps.length} existing trip
                            {overlaps.length === 1 ? '' : 's'}. Confirmed
                            overlaps cannot be saved; planned shared days count
                            once.
                        </p>
                    )}
                    {error && (
                        <p
                            className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}
                    <DialogFooter className="sm:justify-between">
                        <div>
                            {trip && (
                                <Button
                                    disabled={saving}
                                    type="button"
                                    variant="destructive"
                                    onClick={() => void onDelete(trip)}
                                >
                                    <Trash2 /> Delete trip
                                </Button>
                            )}
                        </div>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            <Button
                                disabled={saving}
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="bg-emerald-800 text-white hover:bg-emerald-700"
                                disabled={saving || incomplete}
                                type="submit"
                            >
                                {saving ? 'Saving…' : 'Save trip'}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
