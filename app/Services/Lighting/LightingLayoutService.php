<?php

namespace App\Services\Lighting;

use App\Models\LightingDesign;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class LightingLayoutService
{
    /** @param array<string, mixed> $layout
     * @return array{save_version: int, mutation_id: string, updated_at: string|null}
     */
    public function save(User $user, int $designId, array $layout): array
    {
        return DB::transaction(function () use ($user, $designId, $layout): array {
            $design = $user->lightingDesigns()->lockForUpdate()->findOrFail($designId);
            $mutationHash = hash('sha256', json_encode(Arr::except($layout, ['base_version', 'mutation_id']), JSON_THROW_ON_ERROR));

            if ($design->last_mutation_id === $layout['mutation_id']) {
                abort_unless($design->last_mutation_hash === $mutationHash, 409, 'A save identifier cannot be reused for different changes.');

                return $this->acknowledgement($design);
            }

            abort_unless($design->save_version === (int) $layout['base_version'], 409, 'This design changed in another editor. Your local changes have been preserved.');

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

            $design->connections()->whereNotIn('portable_id', array_column($layout['connections'], 'portable_id'))->delete();
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

            foreach (['rails', 'ducts', 'components', 'connections'] as $group) {
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

            $this->save($user, $copy->id, [
                'base_version' => 0, 'mutation_id' => (string) Str::uuid(),
                'design' => $attributes, ...Arr::only($snapshot, ['rails', 'ducts', 'components', 'connections']),
            ]);

            return $copy->fresh()->loadCount(['components', 'rails', 'ducts', 'connections']);
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
