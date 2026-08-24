<?php

namespace App\Services\Presence\Data;

class SubstantialPresenceTestResult
{
    public const WEIGHT_DENOMINATOR = 6;

    public const CURRENT_YEAR_DAY_THRESHOLD = 31;

    public const WEIGHTED_DAY_THRESHOLD = 183;

    public readonly bool $meets31DayRequirement;

    public readonly bool $meets183DayRequirement;

    public readonly bool $met;

    public function __construct(
        public readonly int $currentYearDays,
        public readonly int $weightedTotalSixths,
    ) {
        $this->meets31DayRequirement = $currentYearDays >= self::CURRENT_YEAR_DAY_THRESHOLD;
        $this->meets183DayRequirement = $weightedTotalSixths
            >= self::WEIGHTED_DAY_THRESHOLD * self::WEIGHT_DENOMINATOR;
        $this->met = $this->meets31DayRequirement && $this->meets183DayRequirement;
    }

    public function weightedTotal(): string
    {
        $wholeDays = intdiv($this->weightedTotalSixths, self::WEIGHT_DENOMINATOR);
        $remainingSixths = $this->weightedTotalSixths % self::WEIGHT_DENOMINATOR;

        if ($remainingSixths === 0) {
            return (string) $wholeDays;
        }

        $divisor = match ($remainingSixths) {
            2, 4 => 2,
            3 => 3,
            default => 1,
        };
        $fraction = intdiv($remainingSixths, $divisor).'/'.intdiv(self::WEIGHT_DENOMINATOR, $divisor);

        return $wholeDays === 0 ? $fraction : $wholeDays.' '.$fraction;
    }
}
