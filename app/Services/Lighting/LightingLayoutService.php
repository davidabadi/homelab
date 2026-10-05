<?php

namespace App\Services\Lighting;

use App\Models\LightingDesign;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LightingLayoutService
{
    /** @param array<string, mixed> $layout
     * @return array{save_version: int, mutation_id: string, updated_at: string|null}
     */
    public function save(User $user, int $designId, array $layout, ?string $mutationHash = null): array
    {
        return DB::transaction(function () use ($user, $designId, $layout, $mutationHash): array {
            $design = $user->lightingDesigns()->lockForUpdate()->findOrFail($designId);
            $mutationHash ??= hash('sha256', json_encode(Arr::except($layout, ['base_version', 'mutation_id']), JSON_THROW_ON_ERROR));

            if ($design->last_mutation_id === $layout['mutation_id']) {
                abort_unless($design->last_mutation_hash === $mutationHash, 409, 'A save identifier cannot be reused for different changes.');

                return $this->acknowledgement($design);
            }

            abort_unless($design->save_version === (int) $layout['base_version'], 409, 'This design changed in another editor. Your local changes have been preserved.');

            if ($layout['structured'] ?? false) {
                $remainingRows = array_column($layout['rails'], 'portable_id');
                $remainingComponents = [];
                foreach ($layout['components'] as $component) {
                    $remainingComponents[$component['portable_id']] = $component;
                }
                foreach ($design->components()->with('rail')->whereNotNull('rail_id')->get() as $component) {
                    $remaining = $remainingComponents[$component->portable_id] ?? null;
                    if ($remaining !== null && ! in_array($component->rail->portable_id, $remainingRows, true)
                        && ($remaining['rail_portable_id'] ?? null) === null) {
                        throw ValidationException::withMessages([
                            'rails' => 'Only empty rows can be removed. Move or remove their devices first.',
                        ]);
                    }
                }
            }

            $railIds = [];
            foreach ($layout['rails'] as $railData) {
                $rail = $design->rails()->updateOrCreate(
                    ['portable_id' => $railData['portable_id']],
                    $railData,
                );
                $railIds[$rail->portable_id] = $rail->id;
            }

            foreach ($layout['ducts'] as $ductData) {
                $design->ducts()->updateOrCreate(['portable_id' => $ductData['portable_id']], $ductData);
            }

            $componentIds = [];
            foreach ($layout['components'] as $componentData) {
                $component = $design->components()->updateOrCreate(
                    ['portable_id' => $componentData['portable_id']],
                    [
                        ...Arr::except($componentData, 'rail_portable_id'),
                        'rail_id' => isset($componentData['rail_portable_id'])
                            ? $railIds[$componentData['rail_portable_id']] : null,
                    ],
                );
                $componentIds[$component->portable_id] = $component->id;
            }

            foreach ($layout['connections'] as $connectionData) {
                $design->connections()->updateOrCreate(
                    ['portable_id' => $connectionData['portable_id']],
                    [
                        ...Arr::except($connectionData, ['source_portable_id', 'target_portable_id']),
                        'source_component_id' => $componentIds[$connectionData['source_portable_id']],
                        'target_component_id' => $componentIds[$connectionData['target_portable_id']],
                    ],
                );
            }

            $entryIds = [];
            foreach ($layout['cable_entries'] as $entryData) {
                $entry = $design->cableEntries()->updateOrCreate(['portable_id' => $entryData['portable_id']], $entryData);
                $entryIds[$entry->portable_id] = $entry->id;
            }
            $bundleIds = [];
            foreach ($layout['cable_bundles'] as $bundleData) {
                $bundle = $design->cableBundles()->updateOrCreate(['portable_id' => $bundleData['portable_id']], [
                    ...Arr::except($bundleData, 'cable_entry_portable_id'),
                    'cable_entry_id' => $entryIds[$bundleData['cable_entry_portable_id']],
                ]);
                $bundleIds[$bundle->portable_id] = $bundle->id;
            }
            foreach ($layout['external_cables'] as $cableData) {
                $design->externalCables()->updateOrCreate(['portable_id' => $cableData['portable_id']], [
                    ...Arr::except($cableData, ['bundle_portable_id', 'cable_entry_portable_id', 'internal_component_portable_id']),
                    'bundle_id' => isset($cableData['bundle_portable_id']) ? $bundleIds[$cableData['bundle_portable_id']] : null,
                    'cable_entry_id' => isset($cableData['cable_entry_portable_id']) ? $entryIds[$cableData['cable_entry_portable_id']] : null,
                    'internal_component_id' => isset($cableData['internal_component_portable_id']) ? $componentIds[$cableData['internal_component_portable_id']] : null,
                ]);
            }

            $design->externalCables()->whereNotIn('portable_id', array_column($layout['external_cables'], 'portable_id'))->delete();
            $design->cableBundles()->whereNotIn('portable_id', array_column($layout['cable_bundles'], 'portable_id'))->delete();
            $design->cableEntries()->whereNotIn('portable_id', array_column($layout['cable_entries'], 'portable_id'))->delete();
            $design->connections()->whereNotIn('portable_id', array_column($layout['connections'], 'portable_id'))->delete();
            $removedComponentIds = $design->components()->whereNotIn('portable_id', array_column($layout['components'], 'portable_id'))->pluck('id');
            $design->externalCables()->whereIn('internal_component_id', $removedComponentIds)->update([
                'internal_component_id' => null, 'internal_terminal' => null, 'branch_route_points' => '[]',
            ]);
            $design->components()->whereNotIn('portable_id', array_column($layout['components'], 'portable_id'))->delete();
            $design->ducts()->whereNotIn('portable_id', array_column($layout['ducts'], 'portable_id'))->delete();
            $design->rails()->whereNotIn('portable_id', array_column($layout['rails'], 'portable_id'))->delete();

            $design->fill($layout['design']);
            $design->save_version++;
            $design->last_mutation_id = $layout['mutation_id'];
            $design->last_mutation_hash = $mutationHash;
            $design->save();

            return $this->acknowledgement($design);
        });
    }

    public function duplicate(User $user, int $designId, LightingDesignPresenter $presenter): LightingDesign
    {
        return DB::transaction(function () use ($user, $designId, $presenter): LightingDesign {
            $source = $user->lightingDesigns()->lockForUpdate()->findOrFail($designId);
            $snapshot = $presenter->layout($source);
            $attributes = Arr::only($snapshot['design'], LightingDesign::EDITABLE_FIELDS);
            $attributes['name'] = Str::limit($source->name, 245, '').' (copy)';
            $copy = $user->lightingDesigns()->create($attributes);
            $idMap = [];

            foreach (['rails', 'ducts', 'components', 'connections', ...LightingCablingLayout::GROUPS] as $group) {
                foreach ($snapshot[$group] as &$item) {
                    $oldId = $item['portable_id'];
                    $item['portable_id'] = (string) Str::uuid();
                    $idMap[$oldId] = $item['portable_id'];
                }
                unset($item);
            }

            foreach ($snapshot['components'] as &$component) {
                $component['rail_portable_id'] = isset($component['rail_portable_id'])
                    ? $idMap[$component['rail_portable_id']] : null;
                $component['metadata'] = (array) $component['metadata'];
            }
            unset($component);
            foreach ($snapshot['connections'] as &$connection) {
                $connection['source_portable_id'] = $idMap[$connection['source_portable_id']];
                $connection['target_portable_id'] = $idMap[$connection['target_portable_id']];
            }
            unset($connection);
            foreach ($snapshot['cable_bundles'] as &$bundle) {
                $bundle['cable_entry_portable_id'] = $idMap[$bundle['cable_entry_portable_id']];
                $bundle['metadata'] = (array) $bundle['metadata'];
            }
            unset($bundle);
            foreach ($snapshot['cable_entries'] as &$entry) {
                $entry['metadata'] = (array) $entry['metadata'];
            }
            unset($entry);
            foreach ($snapshot['external_cables'] as &$cable) {
                foreach (['bundle_portable_id', 'cable_entry_portable_id', 'internal_component_portable_id'] as $reference) {
                    $cable[$reference] = isset($cable[$reference]) ? $idMap[$cable[$reference]] : null;
                }
                $cable['metadata'] = (array) $cable['metadata'];
            }
            unset($cable);

            $this->save($user, $copy->id, [
                'base_version' => 0, 'mutation_id' => (string) Str::uuid(),
                'design' => $attributes, ...Arr::only($snapshot, ['rails', 'ducts', 'components', 'connections', ...LightingCablingLayout::GROUPS]),
            ]);

            return $copy->fresh()->loadCount([...LightingDesignPresenter::COUNT_RELATIONS, 'externalCables as unassigned_external_cables_count' => fn ($query) => $query->whereNull('internal_component_id')]);
        });
    }

    /** @return array{save_version: int, mutation_id: string, updated_at: string|null} */
    private function acknowledgement(LightingDesign $design): array
    {
        return [
            'save_version' => $design->save_version,
            'mutation_id' => $design->last_mutation_id,
            'updated_at' => $design->updated_at?->toIso8601String(),
        ];
    }
}
