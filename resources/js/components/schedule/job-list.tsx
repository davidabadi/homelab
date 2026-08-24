import { AlertTriangle, ArrowUpDown, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { conflictedJobResources, visibleOnDay } from './calculations';
import { dayNames } from './types';
import type {
    DayFilterValue,
    ScheduleConflict,
    ScheduleJob,
    ScheduleResource,
} from './types';

type SortKey = 'time' | 'name' | 'duration';

type Props = {
    jobs: ScheduleJob[];
    resources: ScheduleResource[];
    conflicts: ScheduleConflict[];
    activeDay: DayFilterValue;
    onEdit: (job: ScheduleJob) => void;
};

export function JobList({
    jobs,
    resources,
    conflicts,
    activeDay,
    onEdit,
}: Props) {
    const [sort, setSort] = useState<SortKey>('time');
    const conflicted = useMemo(
        () => conflictedJobResources(conflicts, activeDay),
        [conflicts, activeDay],
    );
    const sorted = [...jobs]
        .filter((job) => visibleOnDay(job, activeDay))
        .sort((left, right) => {
            if (sort === 'name') {
                return left.name.localeCompare(right.name);
            }

            if (sort === 'duration') {
                return right.duration_minutes - left.duration_minutes;
            }

            return left.start_time.localeCompare(right.start_time);
        });

    return (
        <section
            aria-labelledby="job-list-heading"
            className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900"
        >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
                <h2
                    id="job-list-heading"
                    className="text-sm font-bold tracking-[0.16em] text-slate-300 uppercase"
                >
                    Jobs
                </h2>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                    <ArrowUpDown aria-hidden="true" className="size-3.5" />
                    Sort
                    <select
                        className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-slate-200 focus-visible:outline-2 focus-visible:outline-amber-400"
                        value={sort}
                        onChange={(event) =>
                            setSort(event.target.value as SortKey)
                        }
                    >
                        <option value="time">Start time</option>
                        <option value="name">Name</option>
                        <option value="duration">Duration</option>
                    </select>
                </label>
            </div>
            {sorted.length === 0 ? (
                <p className="p-6 text-sm text-slate-500">
                    No jobs match this view. Add a job to place work on the
                    timeline.
                </p>
            ) : (
                <div className="divide-y divide-slate-800">
                    {sorted.map((job) => {
                        const hasConflict = job.resources.some((resourceId) =>
                            conflicted.has(`${job.id}:${resourceId}`),
                        );
                        const dayText =
                            job.weekdays.length === 7
                                ? 'Every day'
                                : job.weekdays
                                      .map((day) => dayNames[day])
                                      .join(' ');

                        return (
                            <button
                                key={job.id}
                                className="focus-visible:outline-inset grid w-full gap-2 px-4 py-3 text-left transition hover:bg-slate-800/60 focus-visible:bg-slate-800 focus-visible:outline-2 focus-visible:outline-amber-400 md:grid-cols-[minmax(12rem,1fr)_13rem_minmax(12rem,1fr)_auto] md:items-center"
                                type="button"
                                onClick={() => onEdit(job)}
                            >
                                <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-100">
                                    <span
                                        className={`size-2.5 shrink-0 rounded-full ${hasConflict ? 'bg-pink-400' : 'bg-sky-400'}`}
                                    />
                                    <span className="truncate">{job.name}</span>
                                    {hasConflict && (
                                        <span className="sr-only">
                                            Has conflict
                                        </span>
                                    )}
                                </span>
                                <span className="font-mono text-xs text-slate-400">
                                    {job.start_time} · {job.duration_minutes}m ·{' '}
                                    {dayText}
                                </span>
                                <span className="flex flex-wrap gap-1">
                                    {job.resources.map((resourceId) => (
                                        <span
                                            key={resourceId}
                                            className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${conflicted.has(`${job.id}:${resourceId}`) ? 'border-pink-400/50 bg-pink-500/15 text-pink-200' : 'border-slate-600 text-slate-400'}`}
                                        >
                                            {conflicted.has(
                                                `${job.id}:${resourceId}`,
                                            ) && (
                                                <AlertTriangle
                                                    aria-hidden="true"
                                                    className="mr-1 inline size-3"
                                                />
                                            )}
                                            {resources.find(
                                                (resource) =>
                                                    resource.id === resourceId,
                                            )?.label ?? 'Removed resource'}
                                        </span>
                                    ))}
                                </span>
                                <span className="flex items-center gap-1 text-xs font-semibold text-amber-300">
                                    <Pencil
                                        aria-hidden="true"
                                        className="size-3"
                                    />{' '}
                                    Edit
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
