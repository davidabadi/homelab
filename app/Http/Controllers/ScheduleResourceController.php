<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreScheduleResourceRequest;
use App\Http\Requests\UpdateScheduleResourceRequest;
use App\Models\ScheduleResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class ScheduleResourceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $resources = $request->user()->scheduleResources()->orderBy('label')->get();

        return response()->json(['resources' => $resources->map($this->present(...))->values()]);
    }

    public function store(StoreScheduleResourceRequest $request): JsonResponse
    {
        $resource = $request->user()->scheduleResources()->create([
            ...$request->validated(),
            'portable_id' => (string) Str::uuid(),
        ]);

        return response()->json(['resource' => $this->present($resource)], 201);
    }

    public function update(UpdateScheduleResourceRequest $request, string $resource): JsonResponse
    {
        $scheduleResource = $this->ownedResource($request, $resource);
        $scheduleResource->update($request->validated());

        return response()->json(['resource' => $this->present($scheduleResource)]);
    }

    public function destroy(Request $request, string $resource): Response
    {
        $this->ownedResource($request, $resource)->delete();

        return response()->noContent();
    }

    private function ownedResource(Request $request, string $id): ScheduleResource
    {
        return $request->user()->scheduleResources()->findOrFail($id);
    }

    /** @return array<string, mixed> */
    private function present(ScheduleResource $resource): array
    {
        return [
            'id' => $resource->id,
            'label' => $resource->label,
            'subtitle' => $resource->subtitle,
        ];
    }
}
