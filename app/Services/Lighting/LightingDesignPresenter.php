<?php

namespace App\Services\Lighting;

use App\Models\LightingComponentDefinition;
use App\Models\LightingDesign;
use App\Models\LightingDesignCableBundle;
use App\Models\LightingDesignCableEntry;
use App\Models\LightingDesignComponent;
use App\Models\LightingDesignConnection;
use App\Models\LightingDesignDuct;
use App\Models\LightingDesignExternalCable;
use App\Models\LightingDesignRail;
use Illuminate\Support\Arr;

class LightingDesignPresenter
{
    public const COUNT_RELATIONS = ['components', 'rails', 'ducts', 'connections', 'cableEntries', 'cableBundles', 'externalCables'];

    /** @return array<string, mixed> */
    public function design(LightingDesign $design): array
    {
        return [
            'id' => $design->id,
            ...Arr::only($design->toArray(), LightingDesign::EDITABLE_FIELDS),
            'metadata' => (object) ($design->metadata ?? []),
            'save_version' => $design->save_version,
            'updated_at' => $design->updated_at?->toIso8601String(),
            'components_count' => (int) ($design->getAttribute('components_count') ?? 0),
            'rails_count' => (int) ($design->getAttribute('rails_count') ?? 0),
            'ducts_count' => (int) ($design->getAttribute('ducts_count') ?? 0),
            'connections_count' => (int) ($design->getAttribute('connections_count') ?? 0),
            'cable_entries_count' => (int) ($design->getAttribute('cable_entries_count') ?? 0),
            'cable_bundles_count' => (int) ($design->getAttribute('cable_bundles_count') ?? 0),
            'external_cables_count' => (int) ($design->getAttribute('external_cables_count') ?? 0),
            'unassigned_external_cables_count' => (int) ($design->getAttribute('unassigned_external_cables_count') ?? 0),
        ];
    }

    /** @return array<string, mixed> */
    public function definition(LightingComponentDefinition $definition): array
    {
        return [
            ...Arr::only($definition->toArray(), [
                'id', 'catalog_family_id', 'revision', 'manufacturer', 'model', 'display_name',
                'category', 'kind', 'sku', 'width_mm', 'height_mm', 'depth_mm', 'din_modules',
                'mounting_type', 'mounting_anchor_x_mm', 'mounting_anchor_y_mm', 'image_path',
                'image_url', 'datasheet_url', 'description', 'terminals',
            ]),
            'metadata' => (object) ($definition->metadata ?? []),
            'archived_at' => $definition->archived_at?->toIso8601String(),
            'local_image_url' => $definition->image_path !== null
                ? route('lighting.definitions.image', $definition->id, absolute: false)
                : null,
        ];
    }

    /** @return array<string, mixed> */
    public function layout(LightingDesign $design): array
    {
        $design->load([
            'components' => fn ($query) => $query->orderBy('sort_order')->orderBy('id'),
            'components.definition', 'components.rail',
            'rails' => fn ($query) => $query->orderBy('sort_order')->orderBy('id'),
            'ducts' => fn ($query) => $query->orderBy('id'),
            'connections' => fn ($query) => $query->orderBy('id'),
            'connections.sourceComponent', 'connections.targetComponent',
            'cableEntries' => fn ($query) => $query->orderBy('id'),
            'cableBundles' => fn ($query) => $query->orderBy('id'), 'cableBundles.entry',
            'externalCables' => fn ($query) => $query->orderBy('id'),
            'externalCables.bundle', 'externalCables.entry', 'externalCables.internalComponent',
        ])->loadCount([...self::COUNT_RELATIONS, 'externalCables as unassigned_external_cables_count' => fn ($query) => $query->whereNull('internal_component_id')]);
        $definitionIds = collect([
            ...$design->components->pluck('component_definition_id'),
            ...$design->rails->pluck('component_definition_id'),
            ...$design->ducts->pluck('component_definition_id'),
        ])->filter()->unique()->values();

        return [
            'design' => $this->design($design),
            'definitions' => LightingComponentDefinition::query()->whereIn('id', $definitionIds)
                ->orderBy('id')->get()->map($this->definition(...))->values()->all(),
            'components' => $design->components->map(fn (LightingDesignComponent $component): array => [
                ...Arr::only($component->toArray(), [
                    'portable_id', 'component_definition_id', 'sort_order', 'x_mm', 'y_mm', 'rotation', 'custom_label', 'notes',
                ]),
                'rail_portable_id' => $component->rail?->portable_id,
                'metadata' => (object) ($component->metadata ?? []),
            ])->all(),
            'rails' => $design->rails->map(fn (LightingDesignRail $rail): array => Arr::only($rail->toArray(), [
                'portable_id', 'component_definition_id', 'sort_order', 'x_mm', 'y_mm', 'length_mm', 'width_mm',
            ]))->all(),
            'ducts' => $design->ducts->map(fn (LightingDesignDuct $duct): array => Arr::only($duct->toArray(), [
                'portable_id', 'component_definition_id', 'x_mm', 'y_mm', 'length_mm', 'width_mm', 'orientation',
            ]))->all(),
            'connections' => $design->connections->map(fn (LightingDesignConnection $connection): array => [
                ...Arr::only($connection->toArray(), [
                    'portable_id', 'source_terminal', 'target_terminal', 'cable_type', 'color', 'gauge',
                    'conductor_count', 'route_points', 'actual_length_mm', 'notes',
                ]),
                'source_portable_id' => $connection->sourceComponent->portable_id,
                'target_portable_id' => $connection->targetComponent->portable_id,
            ])->all(),
            'cable_entries' => $design->cableEntries->map(fn (LightingDesignCableEntry $entry): array => [
                ...Arr::only($entry->toArray(), ['portable_id', 'label', 'side', 'offset_mm', 'span_mm', 'entry_type', 'notes']),
                'metadata' => (object) ($entry->metadata ?? []),
            ])->all(),
            'cable_bundles' => $design->cableBundles->map(fn (LightingDesignCableBundle $bundle): array => [
                ...Arr::only($bundle->toArray(), ['portable_id', 'name', 'external_location', 'cable_class', 'direction', 'display_color', 'planned_count', 'route_points', 'notes']),
                'cable_entry_portable_id' => $bundle->entry->portable_id,
                'metadata' => (object) ($bundle->metadata ?? []),
            ])->all(),
            'external_cables' => $design->externalCables->map(fn (LightingDesignExternalCable $cable): array => [
                ...Arr::only($cable->toArray(), ['portable_id', 'label', 'cable_type', 'gauge', 'conductor_count', 'internal_terminal', 'cable_class', 'direction', 'branch_route_points', 'notes']),
                'bundle_portable_id' => $cable->bundle?->portable_id,
                'cable_entry_portable_id' => $cable->entry?->portable_id,
                'internal_component_portable_id' => $cable->internalComponent?->portable_id,
                'internal_terminal' => $cable->internal_component_id !== null ? $cable->internal_terminal : null,
                'metadata' => (object) ($cable->metadata ?? []),
            ])->all(),
        ];
    }
}
