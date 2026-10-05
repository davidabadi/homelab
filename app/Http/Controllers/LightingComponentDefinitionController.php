<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreLightingComponentDefinitionRequest;
use App\Models\LightingComponentDefinition;
use App\Services\Lighting\LightingDesignPresenter;
use App\Services\Lighting\LightingInterchangeV1;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class LightingComponentDefinitionController extends Controller
{
    public function catalog(): InertiaResponse
    {
        return Inertia::render('lighting/catalog');
    }

    public function index(Request $request, LightingDesignPresenter $presenter): JsonResponse
    {
        $query = LightingComponentDefinition::query()->whereNull('archived_at');
        if (! $request->boolean('include_revisions')) {
            $query->whereNotExists(static fn (Builder $newer): Builder => $newer->selectRaw('1')
                ->from('lighting_component_definitions as newer')
                ->whereColumn('newer.catalog_family_id', 'lighting_component_definitions.catalog_family_id')
                ->whereColumn('newer.revision', '>', 'lighting_component_definitions.revision')
                ->whereNull('newer.archived_at'));
        }

        return response()->json(['definitions' => $query->orderBy('category')->orderBy('display_name')->get()->map($presenter->definition(...))->values()]);
    }

    public function store(StoreLightingComponentDefinitionRequest $request, LightingDesignPresenter $presenter): JsonResponse
    {
        $attributes = Arr::except($request->validated(), ['image', 'remove_image', 'import_snapshot']);
        $snapshot = $request->validated('import_snapshot');
        $identity = ['catalog_family_id' => (string) Str::uuid(), 'revision' => 1];
        if (is_array($snapshot) && LightingInterchangeV1::samePhysicalDefinition($attributes, $snapshot)) {
            $importedIdentity = Arr::only($snapshot, ['catalog_family_id', 'revision']);
            $existing = LightingComponentDefinition::query()->where($importedIdentity)->first();
            if ($existing !== null && LightingInterchangeV1::samePhysicalDefinition($attributes, $existing->toArray())) {
                throw ValidationException::withMessages(['import_snapshot' => 'This catalog revision already exists. Run the import preflight again or select the existing component.']);
            }
            if ($existing === null) {
                $identity = $importedIdentity;
                $family = LightingComponentDefinition::query()->where('catalog_family_id', $identity['catalog_family_id'])->orderByDesc('revision')->first();
                if ($family?->archived_at !== null) {
                    $identity['archived_at'] = now();
                }
            }
        }
        $attributes = $this->attributes($request);
        try {
            $definition = LightingComponentDefinition::query()->create([...$attributes, ...$identity]);
        } catch (UniqueConstraintViolationException) {
            if ($request->hasFile('image')) {
                Storage::disk('local')->delete($attributes['image_path']);
            }
            throw ValidationException::withMessages(['import_snapshot' => 'This catalog revision was just created. Run the import preflight again.']);
        }

        return response()->json(['definition' => $presenter->definition($definition->refresh())], 201);
    }

    public function revision(StoreLightingComponentDefinitionRequest $request, int $definition, LightingDesignPresenter $presenter): JsonResponse
    {
        $original = LightingComponentDefinition::query()->findOrFail($definition);
        $revised = DB::transaction(function () use ($request, $original): LightingComponentDefinition {
            LightingComponentDefinition::query()->where('catalog_family_id', $original->catalog_family_id)
                ->orderBy('revision')->lockForUpdate()->firstOrFail();
            $latest = LightingComponentDefinition::query()->where('catalog_family_id', $original->catalog_family_id)
                ->orderByDesc('revision')->firstOrFail();
            abort_if($latest->archived_at !== null, 409, 'An archived catalog family cannot be revised.');

            return LightingComponentDefinition::query()->create([
                ...$this->attributes($request, $original),
                'catalog_family_id' => $original->catalog_family_id,
                'revision' => $latest->revision + 1,
            ]);
        });

        return response()->json(['definition' => $presenter->definition($revised->refresh())], 201);
    }

    public function destroy(int $definition): Response
    {
        $original = LightingComponentDefinition::query()->findOrFail($definition);
        DB::transaction(function () use ($original): void {
            LightingComponentDefinition::query()->where('catalog_family_id', $original->catalog_family_id)
                ->orderBy('revision')->lockForUpdate()->firstOrFail();
            LightingComponentDefinition::query()->where('catalog_family_id', $original->catalog_family_id)
                ->whereNull('archived_at')->update(['archived_at' => now()]);
        });

        return response()->noContent();
    }

    public function image(int $definition): StreamedResponse
    {
        $component = LightingComponentDefinition::query()->findOrFail($definition);
        abort_unless($component->image_path !== null && Storage::disk('local')->exists($component->image_path), 404);

        return Storage::disk('local')->response($component->image_path, headers: [
            'Cache-Control' => 'private, max-age=86400',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /** @return array<string, mixed> */
    private function attributes(StoreLightingComponentDefinitionRequest $request, ?LightingComponentDefinition $previous = null): array
    {
        $attributes = Arr::except($request->validated(), ['image', 'remove_image', 'import_snapshot']);
        $attributes['mounting_anchor_x_mm'] ??= round((float) $attributes['width_mm'] / 2, 2);
        $attributes['mounting_anchor_y_mm'] ??= round((float) $attributes['height_mm'] / 2, 2);
        $attributes['image_path'] = $request->hasFile('image')
            ? $request->file('image')->store('lighting/component-images', 'local')
            : ($request->boolean('remove_image') ? null : $previous?->image_path);

        return $attributes;
    }
}
