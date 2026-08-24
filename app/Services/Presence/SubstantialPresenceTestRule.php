<?php

namespace App\Services\Presence;

use App\Services\Presence\Data\SubstantialPresenceTestResult;

class SubstantialPresenceTestRule
{
    public function calculate(
        int $currentYearDays,
        int $previousYearDays,
        int $twoYearsPriorDays,
    ): SubstantialPresenceTestResult {
        return new SubstantialPresenceTestResult(
            currentYearDays: $currentYearDays,
            weightedTotalSixths: ($currentYearDays * 6)
                + ($previousYearDays * 2)
                + $twoYearsPriorDays,
        );
    }
}
