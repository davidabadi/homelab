import { resourceOccupiedMinutes } from './calculations';
import type { DayFilterValue, ScheduleJob, ScheduleResource } from './types';

type Props = {
    resources: ScheduleResource[];
    jobs: ScheduleJob[];
    activeDay: DayFilterValue;
};

export function ResourceUtilization({ resources, jobs, activeDay }: Props) {
    return (
        <section
            aria-labelledby="utilization-heading"
            className="rounded-xl border border-slate-700 bg-slate-900 p-4"
        >
            <h2
                id="utilization-heading"
                className="text-sm font-bold tracking-[0.16em] text-slate-300 uppercase"
            >
                Resource utilization
            </h2>
            <div className="mt-4 grid gap-3">
                {resources.length === 0 && (
                    <p className="text-sm text-slate-500">
                        No resources to measure yet.
                    </p>
                )}
                {resources.map((resource) => {
                    const minutes = resourceOccupiedMinutes(
                        jobs,
                        resource.id,
                        activeDay,
                    );
                    const percentage = Math.min(100, (minutes / 1440) * 100);

                    return (
                        <div
                            key={resource.id}
                            className="grid grid-cols-[minmax(6rem,1fr)_minmax(8rem,2fr)_4rem] items-center gap-3 text-xs"
                        >
                            <span className="truncate font-medium text-slate-300">
                                {resource.label}
                            </span>
                            <span className="h-2 overflow-hidden rounded-full bg-slate-800">
                                <span
                                    className="block h-full rounded-full bg-amber-400"
                                    style={{ width: `${percentage}%` }}
                                />
                            </span>
                            <span className="text-right font-mono text-slate-400">
                                {(minutes / 60).toFixed(1)}h
                            </span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
