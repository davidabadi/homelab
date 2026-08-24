import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Planning } from '@/components/presence/types';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

type Props = {
    open: boolean;
    planning: Planning;
    selectedYear: number;
    saving: boolean;
    error: string | null;
    onOpenChange: (open: boolean) => void;
    onSave: (
        defaultLimit: number | null,
        yearLimit: number | null,
    ) => Promise<void>;
};

export function PlanningEditor({
    open,
    planning,
    selectedYear,
    saving,
    error,
    onOpenChange,
    onSave,
}: Props) {
    const override = planning.yearly_overrides.find(
        (item) => item.year === selectedYear,
    );
    const [defaultValue, setDefaultValue] = useState(
        planning.default_planning_limit?.toString() ?? '',
    );
    const [yearValue, setYearValue] = useState(
        override?.planning_limit.toString() ?? '',
    );

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        await onSave(
            defaultValue === '' ? null : Number(defaultValue),
            yearValue === '' ? null : Number(yearValue),
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="border-emerald-950/15 bg-stone-50 text-stone-900 dark:border-emerald-300/20 dark:bg-stone-950 dark:text-stone-100">
                <DialogHeader>
                    <DialogTitle>Planning targets</DialogTitle>
                    <DialogDescription>
                        Personal planning aids only—not legal or tax
                        conclusions.
                    </DialogDescription>
                </DialogHeader>
                <form className="grid gap-5" onSubmit={submit}>
                    <label className="grid gap-1.5 text-sm font-medium">
                        Default planning limit
                        <input
                            className="h-11 rounded-lg border border-stone-300 bg-white px-3 text-base dark:border-stone-700 dark:bg-stone-900"
                            min="0"
                            placeholder="No default"
                            type="number"
                            value={defaultValue}
                            onChange={(event) =>
                                setDefaultValue(event.target.value)
                            }
                        />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                        {selectedYear} override
                        <input
                            className="h-11 rounded-lg border border-stone-300 bg-white px-3 text-base dark:border-stone-700 dark:bg-stone-900"
                            min="0"
                            placeholder="Use default"
                            type="number"
                            value={yearValue}
                            onChange={(event) =>
                                setYearValue(event.target.value)
                            }
                        />
                        <span className="text-xs font-normal text-stone-500">
                            Leave blank to use the default limit.
                        </span>
                    </label>
                    {error && (
                        <p
                            className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}
                    <DialogFooter>
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
                            disabled={saving}
                            type="submit"
                        >
                            {saving ? 'Saving…' : 'Save targets'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
