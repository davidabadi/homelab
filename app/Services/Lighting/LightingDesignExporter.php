<?php

namespace App\Services\Lighting;

use App\Http\Requests\SaveLightingLayoutRequest;
use App\Models\LightingComponentDefinition;
use App\Models\LightingDesign;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Validator;

class LightingDesignExporter
{
    public function __construct(private LightingInterchangeV1 $schema) {}

    /** @param array<string, mixed> $layout
     * @return array<string, mixed>
     */
    public function document(array $layout): array
    {
        $layout = json_decode(json_encode($layout, JSON_THROW_ON_ERROR), true, 64, JSON_THROW_ON_ERROR);
        $rules = Arr::except((new SaveLightingLayoutRequest)->rules(), ['base_version', 'mutation_id', 'structured']);
        $validated = Validator::make($layout, $rules)->validate();
        $definitionIds = collect([
            ...$validated['components'], ...$validated['rails'], ...$validated['ducts'],
        ])->pluck('component_definition_id')->filter()->unique();
        $definitions = LightingComponentDefinition::query()->whereIn('id', $definitionIds)->get()->keyBy('id');
        $catalog = $definitions->map(fn (LightingComponentDefinition $definition): array => $this->catalogSnapshot($definition))
            ->sortBy(fn (array $snapshot): string => LightingInterchangeV1::referenceKey($snapshot))->values()->all();
        foreach (['components', 'rails', 'ducts'] as $group) {
            foreach ($validated[$group] as &$item) {
                $definition = $definitions->get($item['component_definition_id'] ?? null);
                $item['catalog_ref'] = $definition !== null
                    ? Arr::only($definition->toArray(), ['catalog_family_id', 'revision']) : null;
                unset($item['component_definition_id']);
            }
            unset($item);
        }

        $document = $this->schema->parse([
            'format' => LightingInterchangeV1::FORMAT, 'schema_version' => LightingInterchangeV1::VERSION,
            'exported_at' => now()->utc()->toIso8601String(),
            'design' => [...Arr::only($validated['design'], LightingDesign::EDITABLE_FIELDS), 'metadata' => $validated['design']['metadata'] ?? null],
            'catalog' => $catalog, 'rows' => $validated['rails'],
            ...Arr::only($validated, ['components', 'ducts', 'connections', ...LightingCablingLayout::GROUPS]),
        ]);
        $document['design']['metadata'] = (object) ($document['design']['metadata'] ?? []);
        foreach (['catalog', 'components', ...LightingCablingLayout::GROUPS] as $group) {
            foreach ($document[$group] as &$item) {
                $item['metadata'] = (object) ($item['metadata'] ?? []);
            }
            unset($item);
        }

        return $document;
    }

    /** @return array<string, mixed> */
    public function catalogSnapshot(LightingComponentDefinition $definition): array
    {
        $snapshot = Arr::only($definition->toArray(), LightingInterchangeV1::CATALOG_FIELDS);
        $snapshot['has_local_image'] = $definition->image_path !== null;
        foreach (['image_url', 'datasheet_url'] as $field) {
            $url = $snapshot[$field] ?? null;
            $snapshot[$field] = is_string($url) && preg_match('/^https?:\/\//i', $url) ? $url : null;
        }

        return $snapshot;
    }
}
