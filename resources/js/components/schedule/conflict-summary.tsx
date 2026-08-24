import { AlertTriangle, CircleCheck } from 'lucide-react';
import { conflictApplies, minutesToTime } from './calculations';
import { dayNames } from './types';
import type {
    DayFilterValue,
    ScheduleConflict,
    ScheduleJob,
    ScheduleResource,
} from './types';

type Props = {
    conflicts: ScheduleConflict[];
    jobs: ScheduleJob[];
    resources: ScheduleResource[];
    activeDay: DayFilterValue;
};

export function ConflictSummary({
    conflicts,
    jobs,
    resources,
    activeDay,
}: Props) {
    const visible = conflicts.filter((conflict) =>
        conflictApplies(conflict, activeDay),
    );

    return (
        <section
            aria-labelledby="conflict-heading"
            className="rounded-xl border border-slate-700 bg-slate-900 p-4"
        >
            <h2
                id="conflict-heading"
                className="text-sm font-bold tracking-[0.16em] text-slate-300 uppercase"
            >
                Conflict status
            </h2>
            {visible.length === 0 ? (
                <div
                    className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-300"
                    role="status"
                >
                    <CircleCheck aria-hidden="true" className="size-4" />
                    No overlaps on the current view.
                </div>
            ) : (
                <div className="mt-3 grid gap-2" role="alert">
                    {visible.map((conflict) => {
                        const firstJob = jobs.find(
                            (job) => job.id === conflict.job_a_id,
                        );
                        const secondJob = jobs.find(
                            (job) => job.id === conflict.job_b_id,
                        );
                        const resource = resources.find(
                            (item) => item.id === conflict.resource_id,
                        );
                        const overlaps = conflict.overlaps.filter(
                            (overlap) =>
                                activeDay === 'all' ||
                                overlap.weekday === activeDay,
                        );

                        return (
                            <div
                                key={`${conflict.resource_id}-${conflict.job_a_id}-${conflict.job_b_id}`}
                                className="flex gap-3 rounded-lg border border-pink-400/35 bg-pink-500/10 p-3 text-sm"
                            >
                                <AlertTriangle
                                    aria-hidden="true"
                                    className="mt-0.5 size-4 shrink-0 text-pink-300"
                                />
                                <div>
                                    <p className="font-semibold text-pink-100">
                                        {firstJob?.name ?? 'Unknown job'}{' '}
                                        overlaps{' '}
                                        {secondJob?.name ?? 'Unknown job'}
                                    </p>
                                    <p className="mt-1 font-mono text-xs text-pink-200/75">
                                        {resource?.label ?? 'Unknown resource'}{' '}
                                        ·{' '}
                                        {overlaps
                                            .map(
                                                (overlap) =>
                                                    `${minutesToTime(overlap.start_minute)}–${minutesToTime(overlap.end_minute)} ${dayNames[overlap.weekday]}`,
                                            )
                                            .join(', ')}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
