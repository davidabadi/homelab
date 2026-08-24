<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdatePresencePlanningRequest;
use App\Models\PresencePlanningLimit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PresencePlanningController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json($this->payload($request));
    }

    public function updateDefault(UpdatePresencePlanningRequest $request): JsonResponse
    {
        $request->user()->presencePlanningSetting()->updateOrCreate([], [
            'default_planning_limit' => $request->validated()['default_planning_limit'],
        ]);

        return response()->json($this->payload($request));
    }

    public function updateYear(UpdatePresencePlanningRequest $request, int $year): JsonResponse
    {
        $planningLimit = $request->validated()['planning_limit'];

        if ($planningLimit === null) {
            $request->user()->presencePlanningLimits()->where('year', $year)->delete();
        } else {
            $request->user()->presencePlanningLimits()->updateOrCreate(
                ['year' => $year],
                ['planning_limit' => $planningLimit],
            );
        }

        return response()->json($this->payload($request));
    }

    /** @return array{default_planning_limit: int|null, yearly_overrides: mixed} */
    private function payload(Request $request): array
    {
        return [
            'default_planning_limit' => $request->user()
                ->presencePlanningSetting()
                ->value('default_planning_limit'),
            'yearly_overrides' => $request->user()
                ->presencePlanningLimits()
                ->orderBy('year')
                ->get()
                ->map(fn (PresencePlanningLimit $limit): array => [
                    'year' => $limit->year,
                    'planning_limit' => $limit->planning_limit,
                ]),
        ];
    }
}
