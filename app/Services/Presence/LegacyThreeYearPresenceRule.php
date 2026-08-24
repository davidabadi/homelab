<?php

namespace App\Services\Presence;

class LegacyThreeYearPresenceRule
{
    public function calculate(int $currentYearDays, int $previousYearDays, int $twoYearsPriorDays): int
    {
        return $currentYearDays
            + $this->roundUpFraction($previousYearDays, 3)
            + $this->roundUpFraction($twoYearsPriorDays, 6);
    }

    private function roundUpFraction(int $days, int $divisor): int
    {
        return intdiv($days + $divisor - 1, $divisor);
    }
}
