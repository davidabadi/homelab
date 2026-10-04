<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaveLightingLayoutRequest;
use App\Services\Lighting\LightingLayoutService;
use Illuminate\Http\JsonResponse;

class LightingLayoutController extends Controller
{
    public function update(SaveLightingLayoutRequest $request, int $design, LightingLayoutService $layouts): JsonResponse
    {
        return response()->json($layouts->save($request->user(), $design, $request->validated()));
    }
}
