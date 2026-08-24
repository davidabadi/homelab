<?php

namespace App\Http\Controllers;

use App\Enums\PresenceTotalBasis;
use App\Enums\PresenceTripStatus;
use App\Http\Requests\ShowPresenceDashboardRequest;
use App\Models\PresencePlanningLimit;
use App\Models\PresenceTrip;
use App\Services\Presence\PresenceCalculator;
use Carbon\CarbonImmutable;
use Inertia\Inertia;
use Inertia\Response;

class PresenceDashboardController extends Controller
{
    public function __construct(private readonly PresenceCalculator $calculator) {}

    public function __invoke(ShowPresenceDashboardRequest $request): Response
    {
        $user = $request->user();
        $today = $user->localToday();
        $year = (int) ($request->validated('year') ?? $today->year);
        $trips = $user->presenceTrips()->oldest('entry_date')->oldest('id')->get();
        $defaultPlanningLimit = $user->presencePlanningSetting()->value('default_planning_limit');
        $yearlyOverrides = $user->presencePlanningLimits()->oldest('year')->get();
        $planningLimit = $user->presencePlanningLimits()->where('year', $year)->value('planning_limit')
            ?? $defaultPlanningLimit;
        $summary = $this->calculator->calculate(
            $trips,
            $year,
            $today,
            $planningLimit,
            PresenceTotalBasis::LegacyWeighted,
        );
        $availableYears = collect($this->calculator->availableYears($trips))
            ->merge($yearlyOverrides->pluck('year'))
            ->push($today->year)
            ->push($year);

        if ($availableYears->isNotEmpty()) {
            $availableYears = collect(range((int) $availableYears->min(), (int) $availableYears->max()));
        }

        return Inertia::render('presence/index', [
            'today' => $today->toDateString(),
            'currentYear' => $today->year,
            'selectedYear' => $year,
            'availableYears' => $availableYears->values(),
            'summary' => $summary->toArray(),
            'weightedComponents' => [
                $this->weightedComponent($year, $summary->projectedTotal, 1),
                $this->weightedComponent($year - 1, $summary->previousYearTotal, 3),
                $this->weightedComponent($year - 2, $summary->twoYearsPriorTotal, 6),
            ],
            'trips' => $trips
                ->filter(fn (PresenceTrip $trip): bool => $trip->entry_date->year <= $year
                    && $trip->exit_date->year >= $year)
                ->map(fn (PresenceTrip $trip): array => $this->presentTrip($trip, $year, $today))
                ->values(),
            'currentStatus' => $this->currentStatus($trips, $today),
            'planning' => [
                'default_planning_limit' => $defaultPlanningLimit,
                'yearly_overrides' => $yearlyOverrides->map(
                    fn (PresencePlanningLimit $limit): array => [
                        'year' => $limit->year,
                        'planning_limit' => $limit->planning_limit,
                    ],
                )->values(),
            ],
        ]);
    }

    /** @return array{year: int, days: int, divisor: int, weighted_days: int} */
    private function weightedComponent(int $year, int $days, int $divisor): array
    {
        return [
            'year' => $year,
            'days' => $days,
            'divisor' => $divisor,
            'weighted_days' => intdiv($days + $divisor - 1, $divisor),
        ];
    }

    /** @return array{id: int, entry_date: string, exit_date: string, status: string, notes: string|null, contribution_days: int, actual_days: int, phase: string} */
    private function presentTrip(PresenceTrip $trip, int $year, CarbonImmutable $today): array
    {
        $start = $trip->entry_date->max(CarbonImmutable::create($year, 1, 1));
        $end = $trip->exit_date->min(CarbonImmutable::create($year, 12, 31));
        $actualEnd = $end->min($today);
        $actualDays = $trip->status === PresenceTripStatus::Confirmed && $start->lessThanOrEqualTo($actualEnd)
            ? (int) $start->diffInDays($actualEnd) + 1
            : 0;

        return [
            'id' => $trip->id,
            'entry_date' => $trip->entry_date->toDateString(),
            'exit_date' => $trip->exit_date->toDateString(),
            'status' => $trip->status->value,
            'notes' => $trip->notes,
            'contribution_days' => (int) $start->diffInDays($end) + 1,
            'actual_days' => $actualDays,
            'phase' => match (true) {
                $trip->status === PresenceTripStatus::Planned => 'planned',
                $today->betweenIncluded($trip->entry_date, $trip->exit_date) => 'current',
                $trip->entry_date->greaterThan($today) => 'scheduled',
                default => 'actual',
            },
        ];
    }

    /** @param iterable<PresenceTrip> $trips
     * @return array{inside: bool, day: int|null, trip_id: int|null}
     */
    private function currentStatus(iterable $trips, CarbonImmutable $today): array
    {
        foreach ($trips as $trip) {
            if ($trip->status === PresenceTripStatus::Confirmed
                && $today->betweenIncluded($trip->entry_date, $trip->exit_date)) {
                return [
                    'inside' => true,
                    'day' => (int) $trip->entry_date->diffInDays($today) + 1,
                    'trip_id' => $trip->id,
                ];
            }
        }

        return ['inside' => false, 'day' => null, 'trip_id' => null];
    }
}
