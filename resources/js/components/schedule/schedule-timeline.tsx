import { AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
    conflictedJobResources,
    minutesToTime,
    timelineSegments,
    visibleOnDay,
} from './calculations';
import type {
    DayFilterValue,
    ScheduleConflict,
    ScheduleJob,
    ScheduleResource,
} from './types';

const timelineWidth = 1440;
const labelWidth = 176;

type TimelineJobProps = {
    job: ScheduleJob;
    resource: ScheduleResource;
    activeDay: DayFilterValue;
    hasConflict: boolean;
    onEdit: (job: ScheduleJob) => void;
};

function TimelineJob({
    job,
    resource,
    activeDay,
    hasConflict,
    onEdit,
}: TimelineJobProps) {
    return timelineSegments(job, activeDay).map((segment, index) => {
        const width = segment.end - segment.start;

        return (
            <button
                key={`${job.id}-${index}`}
                aria-label={`${job.name} on ${resource.label}, ${minutesToTime(segment.start)} to ${minutesToTime(segment.end)}${hasConflict ? ', has a conflict' : ''}`}
                className={`absolute top-3 h-12 overflow-hidden rounded-md border px-2 text-left shadow-lg transition hover:z-20 hover:brightness-110 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 ${
                    hasConflict
                        ? 'border-pink-300 bg-pink-600 text-white shadow-pink-950/50'
                        : 'border-sky-300/50 bg-sky-600 text-white shadow-sky-950/40'
                }`}
                style={{ left: segment.start, width: Math.max(width, 6) }}
                title={`${job.name} — ${job.start_time} for ${job.duration_minutes} minutes`}
                type="button"
                onClick={() => onEdit(job)}
            >
                <span className="flex items-center gap-1 truncate text-xs font-bold">
                    {hasConflict && (
                        <AlertTriangle
                            aria-hidden="true"
                            className="size-3 shrink-0"
                        />
                    )}
                    {job.name}
                </span>
                {width > 80 && (
                    <span className="block truncate font-mono text-[10px] opacity-80">
                        {minutesToTime(segment.start)}–
                        {minutesToTime(segment.end)}
                    </span>
                )}
            </button>
        );
    });
}

type ResourceLaneProps = {
    resource: ScheduleResource;
    jobs: ScheduleJob[];
    conflicts: Set<string>;
    activeDay: DayFilterValue;
    onEdit: (job: ScheduleJob) => void;
};

function ResourceLane({
    resource,
    jobs,
    conflicts,
    activeDay,
    onEdit,
}: ResourceLaneProps) {
    return (
        <div className="flex min-w-max border-t border-slate-800">
            <div
                className="sticky left-0 z-30 flex h-20 shrink-0 flex-col justify-center border-r border-slate-700 bg-slate-900/98 px-4 shadow-[8px_0_16px_rgba(2,6,23,.55)]"
                style={{ width: labelWidth }}
            >
                <span className="truncate text-sm font-bold text-slate-100">
                    {resource.label}
                </span>
                {resource.subtitle && (
                    <span className="truncate text-xs text-slate-500">
                        {resource.subtitle}
                    </span>
                )}
            </div>
            <div
                className="relative h-20 shrink-0 bg-[repeating-linear-gradient(to_right,transparent_0,transparent_59px,rgba(71,85,105,.22)_60px)]"
                style={{ width: timelineWidth }}
            >
                {jobs
                    .filter(
                        (job) =>
                            job.resources.includes(resource.id) &&
                            visibleOnDay(job, activeDay),
                    )
                    .map((job) => (
                        <TimelineJob
                            key={job.id}
                            activeDay={activeDay}
                            hasConflict={conflicts.has(
                                `${job.id}:${resource.id}`,
                            )}
                            job={job}
                            resource={resource}
                            onEdit={onEdit}
                        />
                    ))}
            </div>
        </div>
    );
}

type Props = {
    resources: ScheduleResource[];
    jobs: ScheduleJob[];
    conflicts: ScheduleConflict[];
    activeDay: DayFilterValue;
    onEdit: (job: ScheduleJob) => void;
};

export function ScheduleTimeline({
    resources,
    jobs,
    conflicts,
    activeDay,
    onEdit,
}: Props) {
    const [now, setNow] = useState(() => new Date());
    const conflicted = useMemo(
        () => conflictedJobResources(conflicts, activeDay),
        [conflicts, activeDay],
    );

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 30_000);

        return () => window.clearInterval(timer);
    }, []);

    const currentMinute =
        now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

    return (
        <section
            aria-labelledby="timeline-heading"
            className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/20"
        >
            <div className="flex items-center justify-between gap-4 border-b border-slate-700 px-4 py-3">
                <div>
                    <h2
                        id="timeline-heading"
                        className="text-sm font-bold tracking-[0.18em] text-slate-200 uppercase"
                    >
                        24-hour dispatch timeline
                    </h2>
                    <p className="text-xs text-slate-500">
                        Scroll horizontally to inspect the full day.
                    </p>
                </div>
                <span className="shrink-0 font-mono text-xs text-amber-300">
                    LOCAL{' '}
                    {now.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </span>
            </div>
            <div
                className="overflow-x-auto"
                data-testid="schedule-timeline-scroll"
            >
                <div className="relative min-w-max">
                    <div className="flex h-11 border-b border-slate-700 bg-slate-950/90">
                        <div
                            className="sticky left-0 z-40 flex shrink-0 items-center border-r border-slate-700 bg-slate-950 px-4 text-[10px] font-bold tracking-widest text-slate-500 uppercase"
                            style={{ width: labelWidth }}
                        >
                            Resource
                        </div>
                        <div
                            className="relative shrink-0"
                            style={{ width: timelineWidth }}
                        >
                            {Array.from(
                                { length: 13 },
                                (_, index) => index * 2,
                            ).map((hour) => (
                                <span
                                    key={hour}
                                    className="absolute top-3 -translate-x-1/2 font-mono text-[10px] text-slate-500"
                                    style={{ left: hour * 60 }}
                                >
                                    {String(hour).padStart(2, '0')}
                                </span>
                            ))}
                        </div>
                    </div>
                    {resources.length === 0 ? (
                        <div className="flex h-28 items-center px-6 text-sm text-slate-500">
                            Add a resource to create the first schedule lane.
                        </div>
                    ) : (
                        resources.map((resource) => (
                            <ResourceLane
                                key={resource.id}
                                activeDay={activeDay}
                                conflicts={conflicted}
                                jobs={jobs}
                                resource={resource}
                                onEdit={onEdit}
                            />
                        ))
                    )}
                    {resources.length > 0 && (
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute top-11 bottom-0 z-20 w-px bg-amber-300 shadow-[0_0_8px_#fcd34d]"
                            style={{ left: labelWidth + currentMinute }}
                        >
                            <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-amber-300" />
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
