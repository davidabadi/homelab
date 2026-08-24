<?php

namespace App\Http\Controllers;

use App\Enums\PresenceTotalBasis;
use App\Http\Requests\CalculatePresenceSummaryRequest;
use App\Services\Presence\PresenceCalculator;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;

class PresenceSummaryController extends Controller
{
    public function __construct(private readonly PresenceCalculator $calculator) {}

    public function __invoke(CalculatePresenceSummaryRequest $request, int $year): JsonResponse
    {
        $validated = $request->validated();
        $user = $request->user();
        $trips = $user->presenceTrips()->orderBy('entry_date')->get();
        $planningLimit = $user->presencePlanningLimits()->where('year', $year)->value('planning_limit')
            ?? $user->presencePlanningSetting()->value('default_planning_limit');
        $asOf = isset($validated['as_of'])
            ? CarbonImmutable::parse($validated['as_of'])
            : $user->localToday();
        $basis = isset($validated['basis'])
            ? PresenceTotalBasis::from($validated['basis'])
            : PresenceTotalBasis::DEFAULT_PLANNING_BASIS;
        $summary = $this->calculator->calculate($trips, $year, $asOf, $planningLimit, $basis);

        return response()->json([
            ...$summary->toArray(),
            'available_years' => $this->calculator->availableYears($trips),
        ]);
    }
}
