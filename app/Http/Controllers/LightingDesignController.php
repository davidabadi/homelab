<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreLightingDesignRequest;
use App\Http\Requests\UpdateLightingDesignRequest;
use App\Services\Lighting\LightingDesignPresenter;
use App\Services\Lighting\LightingLayoutService;
use App\Services\Lighting\LightingRowLayout;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class LightingDesignController extends Controller
{
    public function home(): InertiaResponse
    {
        return Inertia::render('lighting/index');
    }

    public function edit(Request $request, int $design): InertiaResponse
    {
        $ownedDesign = $request->user()->lightingDesigns()->findOrFail($design);

        return Inertia::render('lighting/editor', ['designId' => $ownedDesign->id]);
    }

    public function index(Request $request, LightingDesignPresenter $presenter): JsonResponse
    {
        $designs = $request->user()->lightingDesigns()->withCount([...LightingDesignPresenter::COUNT_RELATIONS, 'externalCables as unassigned_external_cables_count' => fn ($query) => $query->whereNull('internal_component_id')])
            ->orderByDesc('updated_at')->orderByDesc('id')->get()->map($presenter->design(...))->values();

        return response()->json(['designs' => $designs]);
    }

    public function store(StoreLightingDesignRequest $request, LightingDesignPresenter $presenter): JsonResponse
    {
        $design = DB::transaction(function () use ($request) {
            $design = $request->user()->lightingDesigns()->create([
                ...LightingRowLayout::DESIGN_DEFAULTS, ...$request->validated(),
            ])->refresh();
            LightingRowLayout::createDefaultRows($design);

            return $design->loadCount(LightingDesignPresenter::COUNT_RELATIONS);
        });

        return response()->json(['design' => $presenter->design($design)], 201);
    }

    public function show(Request $request, int $design, LightingDesignPresenter $presenter): JsonResponse
    {
        return response()->json($presenter->layout($request->user()->lightingDesigns()->findOrFail($design)));
    }

    public function update(UpdateLightingDesignRequest $request, int $design, LightingDesignPresenter $presenter): JsonResponse
    {
        $updated = DB::transaction(function () use ($request, $design) {
            $owned = $request->user()->lightingDesigns()->lockForUpdate()->findOrFail($design);
            $owned->fill($request->validated());
            $owned->save_version++;
            $owned->last_mutation_id = null;
            $owned->last_mutation_hash = null;
            $owned->save();

            return $owned->loadCount([...LightingDesignPresenter::COUNT_RELATIONS, 'externalCables as unassigned_external_cables_count' => fn ($query) => $query->whereNull('internal_component_id')]);
        });

        return response()->json(['design' => $presenter->design($updated)]);
    }

    public function destroy(Request $request, int $design): Response
    {
        $request->user()->lightingDesigns()->findOrFail($design)->delete();

        return response()->noContent();
    }

    public function duplicate(Request $request, int $design, LightingLayoutService $layouts, LightingDesignPresenter $presenter): JsonResponse
    {
        return response()->json(['design' => $presenter->design($layouts->duplicate($request->user(), $design, $presenter))], 201);
    }
}
