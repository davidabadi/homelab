<?php

namespace App\Services\Presence\Data;

use App\Enums\PresenceTotalBasis;

class PresenceYearSummary
{
    public function __construct(
        public readonly int $year,
        public readonly string $asOf,
        public readonly int $confirmedDaysElapsed,
        public readonly int $confirmedScheduledDays,
        public readonly int $plannedDays,
        public readonly int $projectedTotal,
        public readonly int $previousYearTotal,
        public readonly int $twoYearsPriorTotal,
        public readonly int $legacyWeightedTotal,
        public readonly ?int $planningLimit,
        public readonly PresenceTotalBasis $planningBasis,
        public readonly int $selectedCalculatedTotal,
        public readonly ?int $remainingAgainstPlanningLimit,
    ) {}

    /** @return array<string, int|string|null> */
    public function toArray(): array
    {
        return [
            'year' => $this->year,
            'as_of' => $this->asOf,
            'confirmed_days_elapsed' => $this->confirmedDaysElapsed,
            'confirmed_scheduled_days' => $this->confirmedScheduledDays,
            'planned_days' => $this->plannedDays,
            'projected_total' => $this->projectedTotal,
            'previous_year_total' => $this->previousYearTotal,
            'two_years_prior_total' => $this->twoYearsPriorTotal,
            'legacy_weighted_total' => $this->legacyWeightedTotal,
            'planning_limit' => $this->planningLimit,
            'planning_basis' => $this->planningBasis->value,
            'selected_calculated_total' => $this->selectedCalculatedTotal,
            'remaining_against_planning_limit' => $this->remainingAgainstPlanningLimit,
        ];
    }
}
