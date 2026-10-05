<?php

namespace App\Services\Lighting;

use App\Models\LightingComponentDefinition;
use App\Models\LightingDesign;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LightingDesignImporter
{
    public function __construct(
        private LightingInterchangeV1 $schema,
        private LightingDesignPresenter $presenter,
    ) {}

    /** @param list<array{catalog_ref: array{catalog_family_id: string, revision: int}, component_definition_id: int}> $resolutions
     * @return array<string, mixed>
     */
    public function preflight(mixed $input, array $resolutions = []): array
    {
        $document = $this->schema->parse($input);
        $selected = [];
        $catalogKeys = array_map(LightingInterchangeV1::referenceKey(...), $document['catalog']);
        $selectedDefinitions = LightingComponentDefinition::query()->whereIn('id', array_column($resolutions, 'component_definition_id'))->get()->keyBy('id');
        foreach ($resolutions as $index => $resolution) {
            $key = LightingInterchangeV1::referenceKey($resolution['catalog_ref']);
            if (! in_array($key, $catalogKeys, true) || isset($selected[$key])) {
                throw ValidationException::withMessages(["resolutions.{$index}.catalog_ref" => 'Choose each referenced catalog definition at most once.']);
            }
            $definition = $selectedDefinitions->get($resolution['component_definition_id']);
            if ($definition === null) {
                throw ValidationException::withMessages(["resolutions.{$index}.component_definition_id" => 'The selected catalog component no longer exists.']);
            }
            $selected[$key] = $definition;
        }
        $families = array_column($document['catalog'], 'catalog_family_id');
        $existing = LightingComponentDefinition::query()->whereIn('catalog_family_id', $families)->get();
        $byReference = $existing->keyBy(fn (LightingComponentDefinition $definition): string => LightingInterchangeV1::referenceKey($definition->toArray()));
        $entries = [];
        $actualDefinitions = [];
        foreach ($document['catalog'] as $snapshot) {
            $key = LightingInterchangeV1::referenceKey($snapshot);
            $definition = $selected[$key] ?? $byReference->get($key);
            $status = 'missing';
            $message = 'Create or select the required catalog component before importing.';
            if ($definition !== null) {
                if (isset($selected[$key])) {
                    $status = 'resolved';
                    $message = null;
                } elseif (LightingInterchangeV1::samePhysicalDefinition($snapshot, $definition->toArray())) {
                    $status = 'exact';
                    $message = null;
                } else {
                    $status = 'conflict';
                    $message = 'This catalog identity exists with different physical details. Review and explicitly select a compatible component.';
                }
                if ($definition->kind !== $snapshot['kind']) {
                    throw ValidationException::withMessages(['resolutions' => 'The selected catalog component has the wrong kind for this layout.']);
                }
                if ($status !== 'conflict') {
                    $actualDefinitions[$key] = $definition->toArray();
                }
            }
            $entries[] = [
                'catalog_ref' => Arr::only($snapshot, ['catalog_family_id', 'revision']),
                'status' => $status, 'snapshot' => [...$snapshot, 'metadata' => (object) ($snapshot['metadata'] ?? [])],
                'definition' => $definition !== null ? $this->presenter->definition($definition) : null,
                'message' => $message,
            ];
        }
        $ready = count($actualDefinitions) === count($document['catalog']);
        if ($ready) {
            $this->schema->validatePhysicalLayout($document, $actualDefinitions);
        }

        return [
            'entries' => $entries, 'ready' => $ready,
            'catalog' => LightingComponentDefinition::query()->whereNull('archived_at')->orderBy('display_name')->get()
                ->map($this->presenter->definition(...))->values()->all(),
        ];
    }

    /** @param list<array{catalog_ref: array{catalog_family_id: string, revision: int}, component_definition_id: int}> $resolutions */
    public function import(User $user, mixed $input, string $name, array $resolutions): LightingDesign
    {
        $document = $this->schema->parse($input);

        return DB::transaction(function () use ($user, $document, $name, $resolutions): LightingDesign {
            $preflight = $this->preflight($document, $resolutions);
            if (! $preflight['ready']) {
                throw ValidationException::withMessages(['resolutions' => 'Resolve every missing or conflicting catalog component before importing.']);
            }
            $definitionIds = [];
            foreach ($preflight['entries'] as $entry) {
                $definitionIds[LightingInterchangeV1::referenceKey($entry['catalog_ref'])] = $entry['definition']['id'];
            }
            $design = $user->lightingDesigns()->create([...$document['design'], 'name' => $name]);
            $ids = [];
            foreach (['rows', 'ducts', 'components', 'connections'] as $group) {
                foreach ($document[$group] as $item) {
                    $ids[$item['portable_id']] = (string) Str::uuid();
                }
            }
            $railIds = [];
            foreach ($document['rows'] as $row) {
                $rail = $design->rails()->create([
                    ...Arr::except($row, ['catalog_ref', 'portable_id']),
                    'portable_id' => $ids[$row['portable_id']],
                    'component_definition_id' => $row['catalog_ref'] !== null ? $definitionIds[LightingInterchangeV1::referenceKey($row['catalog_ref'])] : null,
                ]);
                $railIds[$row['portable_id']] = $rail->id;
            }
            foreach ($document['ducts'] as $duct) {
                $design->ducts()->create([
                    ...Arr::except($duct, ['catalog_ref', 'portable_id']),
                    'portable_id' => $ids[$duct['portable_id']],
                    'component_definition_id' => $duct['catalog_ref'] !== null ? $definitionIds[LightingInterchangeV1::referenceKey($duct['catalog_ref'])] : null,
                ]);
            }
            $componentIds = [];
            foreach ($document['components'] as $component) {
                $created = $design->components()->create([
                    ...Arr::except($component, ['catalog_ref', 'portable_id', 'rail_portable_id']),
                    'portable_id' => $ids[$component['portable_id']],
                    'component_definition_id' => $definitionIds[LightingInterchangeV1::referenceKey($component['catalog_ref'])],
                    'rail_id' => isset($component['rail_portable_id']) ? $railIds[$component['rail_portable_id']] : null,
                ]);
                $componentIds[$component['portable_id']] = $created->id;
            }
            foreach ($document['connections'] as $connection) {
                $design->connections()->create([
                    ...Arr::except($connection, ['portable_id', 'source_portable_id', 'target_portable_id']),
                    'portable_id' => $ids[$connection['portable_id']],
                    'source_component_id' => $componentIds[$connection['source_portable_id']],
                    'target_component_id' => $componentIds[$connection['target_portable_id']],
                ]);
            }

            return $design->refresh()->loadCount(['components', 'rails', 'ducts', 'connections']);
        });
    }
}
