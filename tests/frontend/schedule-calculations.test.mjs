import assert from 'node:assert/strict';
import test from 'node:test';
import {
    conflictApplies,
    resourceOccupiedMinutes,
    timelineSegments,
} from '../../resources/js/components/schedule/calculations.ts';

const overnightJob = {
    id: 1,
    name: 'Nightly backup',
    start_time: '23:30',
    duration_minutes: 120,
    weekdays: [0],
    resources: [10],
    notes: null,
};

test('overnight jobs render on both their starting day and following day', () => {
    assert.deepEqual(timelineSegments(overnightJob, 0), [
        { start: 1410, end: 1440 },
    ]);
    assert.deepEqual(timelineSegments(overnightJob, 1), [
        { start: 0, end: 90 },
    ]);
});

test('Sunday jobs wrap correctly into Monday', () => {
    const sundayJob = { ...overnightJob, weekdays: [6] };

    assert.deepEqual(timelineSegments(sundayJob, 0), [
        { start: 0, end: 90 },
    ]);
});

test('resource utilization merges overlapping work instead of double counting it', () => {
    const jobs = [
        { ...overnightJob, start_time: '08:00', duration_minutes: 120 },
        {
            ...overnightJob,
            id: 2,
            start_time: '09:00',
            duration_minutes: 120,
        },
    ];

    assert.equal(resourceOccupiedMinutes(jobs, 10, 0), 180);
});

test('conflicts are filtered by their applicable day', () => {
    const conflict = {
        resource_id: 10,
        job_a_id: 1,
        job_b_id: 2,
        overlaps: [{ weekday: 1, start_minute: 0, end_minute: 30 }],
    };

    assert.equal(conflictApplies(conflict, 'all'), true);
    assert.equal(conflictApplies(conflict, 1), true);
    assert.equal(conflictApplies(conflict, 0), false);
});
