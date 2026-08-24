<?php

declare(strict_types=1);

use App\Enums\PresenceTotalBasis;
use App\Enums\PresenceTripStatus;
use App\Models\PresenceTrip;
use App\Services\Presence\Data\PresenceYearSummary;
use App\Services\Presence\LegacyThreeYearPresenceRule;
use App\Services\Presence\PresenceCalculator;
use Carbon\CarbonImmutable;
use Tests\TestCase;

uses(TestCase::class);

function presenceTrip(
    string $entryDate,
    string $exitDate,
    PresenceTripStatus $status = PresenceTripStatus::Confirmed,
): PresenceTrip {
    return new PresenceTrip([
        'entry_date' => $entryDate,
        'exit_date' => $exitDate,
        'status' => $status,
    ]);
}

/** @param list<PresenceTrip> $trips */
function presenceSummary(array $trips, int $year, string $asOf = '2026-12-31'): PresenceYearSummary
{
    return (new PresenceCalculator)->calculate(
        $trips,
        $year,
        CarbonImmutable::parse($asOf),
    );
}

it('counts entry and exit dates inclusively including a same-day trip', function () {
    $sameDay = presenceSummary([presenceTrip('2026-04-10', '2026-04-10')], 2026);
    $multiDay = presenceSummary([presenceTrip('2026-04-10', '2026-04-12')], 2026);

    expect($sameDay->confirmedScheduledDays)->toBe(1)
        ->and($multiDay->confirmedScheduledDays)->toBe(3);
});

it('counts February 29 as a calendar day in a leap year', function () {
    $summary = presenceSummary([presenceTrip('2024-02-28', '2024-03-01')], 2024, '2024-12-31');

    expect($summary->confirmedScheduledDays)->toBe(3);
});

it('attributes one cross-year trip to each calendar year automatically', function () {
    $trips = [presenceTrip('2026-12-26', '2027-01-05')];

    expect(presenceSummary($trips, 2026)->confirmedScheduledDays)->toBe(6)
        ->and(presenceSummary($trips, 2027, '2027-12-31')->confirmedScheduledDays)->toBe(5)
        ->and((new PresenceCalculator)->availableYears($trips))->toBe([2026, 2027]);
});

it('separates elapsed days from the full schedule for a confirmed trip in progress', function () {
    $summary = presenceSummary(
        [presenceTrip('2026-08-01', '2026-09-10')],
        2026,
        '2026-08-23',
    );

    expect($summary->confirmedDaysElapsed)->toBe(23)
        ->and($summary->confirmedScheduledDays)->toBe(41);
});

it('reports future planned travel separately and includes it in projection', function () {
    $summary = presenceSummary([
        presenceTrip('2026-01-01', '2026-01-05'),
        presenceTrip('2026-10-01', '2026-10-10', PresenceTripStatus::Planned),
    ], 2026, '2026-08-23');

    expect($summary->confirmedDaysElapsed)->toBe(5)
        ->and($summary->plannedDays)->toBe(10)
        ->and($summary->projectedTotal)->toBe(15);
});

it('unions overlapping intervals so totals never double count a calendar date', function () {
    $summary = presenceSummary([
        presenceTrip('2026-01-01', '2026-01-10'),
        presenceTrip('2026-01-05', '2026-01-15'),
        presenceTrip('2026-01-08', '2026-01-12', PresenceTripStatus::Planned),
    ], 2026);

    expect($summary->confirmedScheduledDays)->toBe(15)
        ->and($summary->plannedDays)->toBe(5)
        ->and($summary->projectedTotal)->toBe(15);
});

it('returns zero totals and no generated years when there are no trips', function () {
    $calculator = new PresenceCalculator;
    $summary = $calculator->calculate([], 2026, CarbonImmutable::parse('2026-08-23'));

    expect($summary->confirmedDaysElapsed)->toBe(0)
        ->and($summary->confirmedScheduledDays)->toBe(0)
        ->and($summary->plannedDays)->toBe(0)
        ->and($summary->projectedTotal)->toBe(0)
        ->and($summary->legacyWeightedTotal)->toBe(0)
        ->and($calculator->availableYears([]))->toBe([]);
});

it('reproduces the legacy independent round-up weighting rule', function (
    int $currentYearDays,
    int $previousYearDays,
    int $twoYearsPriorDays,
    int $expected,
) {
    $rule = new LegacyThreeYearPresenceRule;

    expect($rule->calculate($currentYearDays, $previousYearDays, $twoYearsPriorDays))->toBe($expected);
})->with([
    '2023 legacy parity' => [126, 75, 101, 168],
    '2024 legacy parity' => [338, 126, 75, 393],
    '2025 legacy parity' => [315, 338, 126, 449],
    '2026 projected legacy parity' => [293, 315, 338, 455],
    '2027 zero-current-year parity' => [0, 293, 315, 151],
]);

it('calculates prior-year totals as part of the annual summary', function () {
    $summary = presenceSummary([
        presenceTrip('2024-01-01', '2024-01-07'),
        presenceTrip('2025-01-01', '2025-01-08'),
        presenceTrip('2026-01-01', '2026-01-10'),
    ], 2026);

    expect($summary->previousYearTotal)->toBe(8)
        ->and($summary->twoYearsPriorTotal)->toBe(7)
        ->and($summary->legacyWeightedTotal)->toBe(15);
});

it('applies a configurable planning limit to the selected total and allows negatives', function () {
    $summary = (new PresenceCalculator)->calculate(
        [presenceTrip('2026-01-01', '2026-07-19')],
        2026,
        CarbonImmutable::parse('2026-12-31'),
        planningLimit: 180,
        planningBasis: PresenceTotalBasis::Projected,
    );

    expect($summary->selectedCalculatedTotal)->toBe(200)
        ->and($summary->remainingAgainstPlanningLimit)->toBe(-20);
});

it('matches the synthetic as-of regression totals without legacy travel fixtures', function () {
    $summary = presenceSummary([
        presenceTrip('2026-01-01', '2026-07-15'),
        presenceTrip('2026-07-16', '2026-10-20', PresenceTripStatus::Planned),
    ], 2026, '2026-08-23');

    expect($summary->confirmedDaysElapsed)->toBe(196)
        ->and($summary->projectedTotal)->toBe(293);
});
