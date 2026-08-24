import assert from 'node:assert/strict';
import test from 'node:test';
import {
    dateInputForYear,
    datesOverlap,
    formatDateOnly,
    overlappingTrips,
} from '../../resources/js/lib/presence.ts';

test('date-only formatting never shifts the calendar date', () => {
    assert.equal(formatDateOnly('2026-01-01'), 'Jan 1, 2026');
    assert.equal(formatDateOnly('2024-02-29'), 'Feb 29, 2024');
});

test('overlap warnings include shared boundary dates', () => {
    assert.equal(
        datesOverlap(
            { entry_date: '2026-01-01', exit_date: '2026-01-05' },
            { entry_date: '2026-01-05', exit_date: '2026-01-10' },
        ),
        true,
    );
    assert.equal(
        datesOverlap(
            { entry_date: '2026-01-01', exit_date: '2026-01-04' },
            { entry_date: '2026-01-05', exit_date: '2026-01-10' },
        ),
        false,
    );
});

test('the edited trip is excluded from its own overlap warning', () => {
    const trip = {
        id: 7,
        entry_date: '2026-01-01',
        exit_date: '2026-01-05',
        status: 'confirmed',
        notes: null,
        contribution_days: 5,
        actual_days: 5,
        phase: 'actual',
    };

    assert.deepEqual(overlappingTrips(trip, [trip], 7), []);
});

test('new date inputs use today only for the current year', () => {
    assert.equal(dateInputForYear(2026, '2026-08-24'), '2026-08-24');
    assert.equal(dateInputForYear(2027, '2026-08-24'), '2027-01-01');
});
