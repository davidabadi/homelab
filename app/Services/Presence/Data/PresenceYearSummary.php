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
        public readonly int $sptCurrentYearDays,
        public readonly int $sptWeightedTotalSixths,
        public readonly string $sptWeightedTotal,
        public readonly bool $sptMeets31DayRequirement,
        public readonly bool $sptMeets183DayRequirement,
        public readonly bool $sptMet,
        public readonly ?int $planningLimit,
        public readonly PresenceTotalBasis $planningBasis,
        public readonly int $selectedCalculatedTotal,
        public readonly ?int $remainingAgainstPlanningLimit,
    ) {}

    /** @return array<string, bool|int|string|null> */
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
            'spt_current_year_days' => $this->sptCurrentYearDays,
            'spt_weighted_total_sixths' => $this->sptWeightedTotalSixths,
            'spt_weighted_total' => $this->sptWeightedTotal,
            'spt_meets_31_day_requirement' => $this->sptMeets31DayRequirement,
            'spt_meets_183_day_requirement' => $this->sptMeets183DayRequirement,
            'spt_met' => $this->sptMet,
            'planning_limit' => $this->planningLimit,
            'planning_basis' => $this->planningBasis->value,
            'selected_calculated_total' => $this->selectedCalculatedTotal,
            'remaining_against_planning_limit' => $this->remainingAgainstPlanningLimit,
        ];
    }
}
