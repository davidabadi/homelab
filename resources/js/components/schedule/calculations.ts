import type { DayFilterValue, ScheduleConflict, ScheduleJob } from './types';

const minutesPerDay = 1440;
const minutesPerWeek = minutesPerDay * 7;

export type TimelineSegment = {
    start: number;
    end: number;
};

export function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);

    return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
    const normalized =
        ((minutes % minutesPerDay) + minutesPerDay) % minutesPerDay;
    const hours = Math.floor(normalized / 60);

    return `${String(hours).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function timelineSegments(
    job: ScheduleJob,
    activeDay: DayFilterValue,
): TimelineSegment[] {
    if (activeDay === 'all') {
        const start = timeToMinutes(job.start_time);
        const end = start + job.duration_minutes;

        if (end <= minutesPerDay) {
            return [{ start, end }];
        }

        return [
            { start, end: minutesPerDay },
            { start: 0, end: Math.min(end - minutesPerDay, minutesPerDay) },
        ].filter((segment) => segment.start < segment.end);
    }

    const targetStart = activeDay * minutesPerDay;
    const targetEnd = targetStart + minutesPerDay;
    const segments: TimelineSegment[] = [];

    for (const weekday of job.weekdays) {
        const baseStart =
            weekday * minutesPerDay + timeToMinutes(job.start_time);

        for (const offset of [-minutesPerWeek, 0, minutesPerWeek]) {
            const start = baseStart + offset;
            const end = start + job.duration_minutes;
            const intersectionStart = Math.max(start, targetStart);
            const intersectionEnd = Math.min(end, targetEnd);

            if (intersectionStart < intersectionEnd) {
                segments.push({
                    start: intersectionStart - targetStart,
                    end: intersectionEnd - targetStart,
                });
            }
        }
    }

    return segments.filter(
        (segment, index) =>
            segments.findIndex(
                (candidate) =>
                    candidate.start === segment.start &&
                    candidate.end === segment.end,
            ) === index,
    );
}

export function visibleOnDay(
    job: ScheduleJob,
    activeDay: DayFilterValue,
): boolean {
    return activeDay === 'all' || timelineSegments(job, activeDay).length > 0;
}

export function conflictApplies(
    conflict: ScheduleConflict,
    activeDay: DayFilterValue,
): boolean {
    return (
        activeDay === 'all' ||
        conflict.overlaps.some((overlap) => overlap.weekday === activeDay)
    );
}

export function conflictedJobResources(
    conflicts: ScheduleConflict[],
    activeDay: DayFilterValue,
): Set<string> {
    const result = new Set<string>();

    for (const conflict of conflicts.filter((item) =>
        conflictApplies(item, activeDay),
    )) {
        result.add(`${conflict.job_a_id}:${conflict.resource_id}`);
        result.add(`${conflict.job_b_id}:${conflict.resource_id}`);
    }

    return result;
}

export function resourceOccupiedMinutes(
    jobs: ScheduleJob[],
    resourceId: number,
    activeDay: DayFilterValue,
): number {
    const days = activeDay === 'all' ? [0, 1, 2, 3, 4, 5, 6] : [activeDay];

    return Math.max(
        ...days.map((day) => {
            const segments = jobs
                .filter((job) => job.resources.includes(resourceId))
                .flatMap((job) => timelineSegments(job, day))
                .sort((left, right) => left.start - right.start);
            const merged: TimelineSegment[] = [];

            for (const segment of segments) {
                const previous = merged.at(-1);

                if (!previous || segment.start > previous.end) {
                    merged.push({ ...segment });
                } else {
                    previous.end = Math.max(previous.end, segment.end);
                }
            }

            return merged.reduce(
                (total, segment) => total + segment.end - segment.start,
                0,
            );
        }),
    );
}
