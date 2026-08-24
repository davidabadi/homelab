<?php

namespace App\Http\Controllers;

use App\Http\Requests\StorePresenceTripRequest;
use App\Http\Requests\UpdatePresenceTripRequest;
use App\Models\PresenceTrip;
use App\Services\Presence\PresenceTripService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class PresenceTripController extends Controller
{
    public function __construct(private readonly PresenceTripService $tripService) {}

    public function index(Request $request): JsonResponse
    {
        $trips = $request->user()->presenceTrips()
            ->orderByDesc('entry_date')
            ->orderByDesc('id')
            ->get()
            ->map(fn (PresenceTrip $trip): array => $this->present($trip));

        return response()->json(['trips' => $trips]);
    }

    public function store(StorePresenceTripRequest $request): JsonResponse
    {
        $trip = $this->tripService->create($request->user(), $request->tripAttributes());

        return response()->json(['trip' => $this->present($trip)], Response::HTTP_CREATED);
    }

    public function show(Request $request, int $presenceTrip): JsonResponse
    {
        $trip = $request->user()->presenceTrips()->findOrFail($presenceTrip);

        return response()->json(['trip' => $this->present($trip)]);
    }

    public function update(UpdatePresenceTripRequest $request, int $presenceTrip): JsonResponse
    {
        $trip = $request->user()->presenceTrips()->findOrFail($presenceTrip);
        $trip = $this->tripService->update($request->user(), $trip, $request->tripAttributes());

        return response()->json(['trip' => $this->present($trip)]);
    }

    public function destroy(Request $request, int $presenceTrip): Response
    {
        $request->user()->presenceTrips()->findOrFail($presenceTrip)->delete();

        return response()->noContent();
    }

    /** @return array{id: int, entry_date: string, exit_date: string, status: string, notes: string|null} */
    private function present(PresenceTrip $trip): array
    {
        return [
            'id' => $trip->id,
            'entry_date' => $trip->entry_date->toDateString(),
            'exit_date' => $trip->exit_date->toDateString(),
            'status' => $trip->status->value,
            'notes' => $trip->notes,
        ];
    }
}
