export const dayNames = [
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
] as const;

export type DayFilterValue = 'all' | number;

export type ScheduleResource = {
    id: number;
    label: string;
    subtitle: string | null;
};

export type ScheduleJob = {
    id: number;
    name: string;
    start_time: string;
    duration_minutes: number;
    weekdays: number[];
    resources: number[];
    notes: string | null;
};

export type ScheduleJobInput = Omit<ScheduleJob, 'id'>;

export type ScheduleConflictOverlap = {
    weekday: number;
    start_minute: number;
    end_minute: number;
};

export type ScheduleConflict = {
    resource_id: number;
    job_a_id: number;
    job_b_id: number;
    overlaps: ScheduleConflictOverlap[];
};

export type ScheduleBoard = {
    resources: ScheduleResource[];
    jobs: ScheduleJob[];
    conflicts: ScheduleConflict[];
};

export type PersistenceState = 'idle' | 'saving' | 'saved' | 'failed';
