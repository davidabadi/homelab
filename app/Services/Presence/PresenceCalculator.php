<?php

namespace App\Services\Presence;

use App\Enums\PresenceTotalBasis;
use App\Enums\PresenceTripStatus;
use App\Models\PresenceTrip;
use App\Services\Presence\Data\PresenceYearSummary;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

class PresenceCalculator
{
    public function __construct(
        private readonly LegacyThreeYearPresenceRule $legacyRule = new LegacyThreeYearPresenceRule,
    ) {}

    /**
     * @param  iterable<PresenceTrip>  $trips
     */
    public function calculate(
        iterable $trips,
        int $year,
        CarbonImmutable $asOf,
        ?int $planningLimit = null,
        PresenceTotalBasis $planningBasis = PresenceTotalBasis::LegacyWeighted,
    ): PresenceYearSummary {
        $trips = array_values(is_array($trips) ? $trips : iterator_to_array($trips));
        $confirmedDaysElapsed = $this->daysForYear($trips, $year, PresenceTripStatus::Confirmed, $asOf);
        $confirmedScheduledDays = $this->daysForYear($trips, $year, PresenceTripStatus::Confirmed);
        $plannedDays = $this->daysForYear($trips, $year, PresenceTripStatus::Planned);
        $projectedTotal = $this->daysForYear($trips, $year);
        $previousYearTotal = $this->daysForYear($trips, $year - 1);
        $twoYearsPriorTotal = $this->daysForYear($trips, $year - 2);
        $legacyWeightedTotal = $this->legacyRule->calculate(
            $projectedTotal,
            $previousYearTotal,
            $twoYearsPriorTotal,
        );
        $selectedCalculatedTotal = match ($planningBasis) {
            PresenceTotalBasis::ConfirmedElapsed => $confirmedDaysElapsed,
            PresenceTotalBasis::ConfirmedScheduled => $confirmedScheduledDays,
            PresenceTotalBasis::Projected => $projectedTotal,
            PresenceTotalBasis::LegacyWeighted => $legacyWeightedTotal,
        };

        return new PresenceYearSummary(
            year: $year,
            asOf: $asOf->toDateString(),
            confirmedDaysElapsed: $confirmedDaysElapsed,
            confirmedScheduledDays: $confirmedScheduledDays,
            plannedDays: $plannedDays,
            projectedTotal: $projectedTotal,
            previousYearTotal: $previousYearTotal,
            twoYearsPriorTotal: $twoYearsPriorTotal,
            legacyWeightedTotal: $legacyWeightedTotal,
            planningLimit: $planningLimit,
            planningBasis: $planningBasis,
            selectedCalculatedTotal: $selectedCalculatedTotal,
            remainingAgainstPlanningLimit: $planningLimit === null
                ? null
                : $planningLimit - $selectedCalculatedTotal,
        );
    }

    /**
     * @param  iterable<PresenceTrip>  $trips
     * @return list<int>
     */
    public function availableYears(iterable $trips): array
    {
        $years = [];

        foreach ($trips as $trip) {
            $years[] = $this->tripDate($trip, 'entry_date')->year;
            $years[] = $this->tripDate($trip, 'exit_date')->year;
        }

        return $years === [] ? [] : range(min($years), max($years));
    }

    /**
     * @param  list<PresenceTrip>  $trips
     */
    private function daysForYear(
        array $trips,
        int $year,
        ?PresenceTripStatus $status = null,
        ?CarbonImmutable $through = null,
    ): int {
        $yearStart = CarbonImmutable::create($year, 1, 1)->startOfDay();
        $yearEnd = CarbonImmutable::create($year, 12, 31)->startOfDay();
        $intervals = [];

        foreach ($trips as $trip) {
            if ($status !== null && $trip->status !== $status) {
                continue;
            }

            $entryDate = $this->tripDate($trip, 'entry_date');
            $exitDate = $this->tripDate($trip, 'exit_date');
            $intervalStart = $entryDate->greaterThan($yearStart) ? $entryDate : $yearStart;
            $intervalEnd = $exitDate->lessThan($yearEnd) ? $exitDate : $yearEnd;

            if ($through !== null && $through->lessThan($intervalEnd)) {
                $intervalEnd = $through;
            }

            if ($intervalStart->lessThanOrEqualTo($intervalEnd)) {
                $intervals[] = [$intervalStart, $intervalEnd];
            }
        }

        return $this->unionDayCount($intervals);
    }

    private function tripDate(PresenceTrip $trip, string $attribute): CarbonImmutable
    {
        $date = $trip->getAttribute($attribute);

        if ($date instanceof CarbonImmutable) {
            return $date->startOfDay();
        }

        if ($date instanceof CarbonInterface) {
            return CarbonImmutable::instance($date)->startOfDay();
        }

        return CarbonImmutable::parse((string) $date)->startOfDay();
    }

    /**
     * @param  list<array{0: CarbonImmutable, 1: CarbonImmutable}>  $intervals
     */
    private function unionDayCount(array $intervals): int
    {
        usort($intervals, fn (array $left, array $right): int => $left[0] <=> $right[0]);
        $union = [];

        foreach ($intervals as [$start, $end]) {
            $lastIndex = count($union) - 1;

            if ($lastIndex < 0 || $start->greaterThan($union[$lastIndex][1]->addDay())) {
                $union[] = [$start, $end];

                continue;
            }

            if ($end->greaterThan($union[$lastIndex][1])) {
                $union[$lastIndex][1] = $end;
            }
        }

        return array_sum(array_map(
            static fn (array $interval): int => (int) $interval[0]->diffInDays($interval[1]) + 1,
            $union,
        ));
    }
}
