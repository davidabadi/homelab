<?php

namespace App\Services\Lighting;

use App\Http\Requests\SaveLightingLayoutRequest;
use App\Http\Requests\StoreLightingComponentDefinitionRequest;
use App\Http\Requests\StoreLightingDesignRequest;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use JsonException;

class LightingInterchangeV1
{
    public const FORMAT = 'homelab-lighting-design';

    public const VERSION = 1;

    public const MAX_BYTES = 10485760;

    public const CATALOG_FIELDS = [
        'catalog_family_id', 'revision', 'manufacturer', 'model', 'display_name',
        'category', 'kind', 'sku', 'width_mm', 'height_mm', 'depth_mm', 'din_modules',
        'mounting_type', 'mounting_anchor_x_mm', 'mounting_anchor_y_mm', 'terminals',
        'metadata', 'image_url', 'datasheet_url', 'description', 'has_local_image',
    ];

    public const PHYSICAL_FIELDS = [
        'kind', 'width_mm', 'height_mm', 'depth_mm', 'din_modules', 'mounting_type',
        'mounting_anchor_x_mm', 'mounting_anchor_y_mm', 'terminals',
    ];

    /** @return array<string, mixed> */
    public function parse(mixed $input): array
    {
        try {
            $json = is_string($input) ? $input : json_encode($input, JSON_THROW_ON_ERROR);
            if (strlen($json) > self::MAX_BYTES) {
                throw ValidationException::withMessages(['document' => 'The design file must be no larger than 10 MiB.']);
            }
            $document = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw ValidationException::withMessages(['document' => 'Choose a valid JSON design file.']);
        }
        if (! is_array($document) || array_is_list($document)) {
            throw ValidationException::withMessages(['document' => 'The design document must be a JSON object.']);
        }
        if (($document['format'] ?? null) !== self::FORMAT) {
            throw ValidationException::withMessages(['document.format' => 'This file is not a Homelab lighting design.']);
        }
        if (($document['schema_version'] ?? null) !== self::VERSION) {
            throw ValidationException::withMessages(['document.schema_version' => 'This lighting design schema version is not supported.']);
        }

        return $this->validate($document);
    }

    /** @param array<string, mixed> $document
     * @return array<string, mixed>
     */
    public function validate(array $document): array
    {
        $layoutRules = (new SaveLightingLayoutRequest)->rules();
        $rules = [
            'format' => ['required', Rule::in([self::FORMAT])],
            'schema_version' => ['required', 'integer', Rule::in([self::VERSION])],
            'exported_at' => ['required', 'date'],
            'catalog' => ['present', 'array', 'list', 'max:3000'],
        ];
        foreach ($layoutRules as $field => $fieldRules) {
            if (in_array($field, ['base_version', 'mutation_id', 'structured'], true)) {
                continue;
            }
            $field = str_replace('rails', 'rows', $field);
            if (str_ends_with($field, '.component_definition_id')) {
                continue;
            }
            if (preg_match('/^(components|rows|ducts)\.\*$/', $field)) {
                $fieldRules = [str_replace('component_definition_id', 'catalog_ref', $fieldRules[0])];
            }
            $rules[$field] = array_values(array_filter($fieldRules, static fn (mixed $rule): bool => $rule !== 'required_if:structured,true'));
        }
        $referenceRules = [
            'catalog_ref' => ['nullable', 'array:catalog_family_id,revision', 'required_array_keys:catalog_family_id,revision'],
            'catalog_ref.catalog_family_id' => ['required_with:catalog_ref', 'uuid'],
            'catalog_ref.revision' => ['required_with:catalog_ref', 'integer', 'min:1', 'max:2147483647'],
        ];
        foreach (['components', 'rows', 'ducts'] as $group) {
            foreach ($referenceRules as $field => $fieldRules) {
                $rules["{$group}.*.{$field}"] = array_map(static fn (mixed $rule): mixed => $rule === 'required_with:catalog_ref' ? "required_with:document.{$group}.*.catalog_ref" : $rule, $fieldRules);
            }
            $rules["{$group}.*.catalog_ref"] = [$group === 'components' ? 'required' : 'present', 'nullable', 'array:catalog_family_id,revision', 'required_array_keys:catalog_family_id,revision'];
        }
        foreach (['components', 'rows'] as $group) {
            array_unshift($rules["{$group}.*.sort_order"], 'required');
        }
        foreach (self::catalogRules() as $field => $fieldRules) {
            if ($field === 'terminals.*.key') {
                $fieldRules = array_values(array_filter($fieldRules, static fn (mixed $rule): bool => $rule !== 'distinct'));
            }
            $rules['catalog.*.'.$field] = $fieldRules;
        }
        $rules['catalog.*'] = ['array:'.implode(',', self::CATALOG_FIELDS)];
        $validator = Validator::make(['document' => $document], [
            'document' => ['required', 'array:format,schema_version,exported_at,design,catalog,rows,components,ducts,connections'],
            ...array_combine(array_map(static fn (string $key): string => 'document.'.$key, array_keys($rules)), array_values($rules)),
        ]);
        $validator->validate();

        $errors = [];
        $catalog = [];
        foreach ($document['catalog'] as $index => $snapshot) {
            try {
                self::validateCatalogSnapshot($snapshot);
            } catch (ValidationException $exception) {
                foreach ($exception->errors() as $field => $messages) {
                    $errors["document.catalog.{$index}.{$field}"] = $messages;
                }
            }
            $key = self::referenceKey($snapshot);
            if (isset($catalog[$key])) {
                $errors["document.catalog.{$index}.catalog_family_id"] = ['Catalog family and revision references must be unique.'];
            }
            $catalog[$key] = $snapshot;
        }
        $portableIds = [];
        $referencedCatalog = [];
        foreach (['rows', 'components', 'ducts', 'connections'] as $group) {
            foreach ($document[$group] as $index => $item) {
                if (isset($portableIds[strtolower($item['portable_id'])])) {
                    $errors["document.{$group}.{$index}.portable_id"] = ['Object identifiers must be unique across the layout.'];
                }
                $portableIds[strtolower($item['portable_id'])] = true;
                if (in_array($group, ['rows', 'components', 'ducts'], true) && $item['catalog_ref'] !== null) {
                    $key = self::referenceKey($item['catalog_ref']);
                    $referencedCatalog[$key] = true;
                    $definition = $catalog[$key] ?? null;
                    if ($definition === null) {
                        $errors["document.{$group}.{$index}.catalog_ref"] = ['Every catalog reference must have a snapshot in this document.'];
                    } elseif ($definition['kind'] !== ['rows' => 'rail', 'components' => 'component', 'ducts' => 'duct'][$group]) {
                        $errors["document.{$group}.{$index}.catalog_ref"] = ['The catalog kind does not match this layout object.'];
                    }
                }
            }
        }
        foreach ($document['catalog'] as $index => $snapshot) {
            if (! isset($referencedCatalog[self::referenceKey($snapshot)])) {
                $errors["document.catalog.{$index}.catalog_family_id"] = ['Catalog snapshots must be referenced by this design.'];
            }
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
        $this->validatePhysicalLayout($document, $catalog);

        return $document;
    }

    /** @return array<string, array<mixed>> */
    private static function catalogRules(): array
    {
        return [
            ...Arr::except(StoreLightingComponentDefinitionRequest::definitionRules(), ['image', 'remove_image']),
            'catalog_family_id' => ['required', 'uuid'],
            'revision' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'has_local_image' => ['required', 'boolean'],
        ];
    }

    /** @param array<string, mixed> $snapshot
     * @return array<string, mixed>
     */
    public static function validateCatalogSnapshot(array $snapshot): array
    {
        $validated = Validator::make(['snapshot' => $snapshot], [
            'snapshot' => ['array:'.implode(',', self::CATALOG_FIELDS)],
            ...array_combine(array_map(static fn (string $key): string => 'snapshot.'.$key, array_keys(self::catalogRules())), array_values(self::catalogRules())),
        ])->validate()['snapshot'];
        $errors = [];
        foreach ($validated['terminals'] as $index => $terminal) {
            if ($terminal['x_mm'] > $validated['width_mm'] || $terminal['y_mm'] > $validated['height_mm']) {
                $errors["terminals.{$index}"] = ['Terminal positions must fit inside the component dimensions.'];
            }
        }
        foreach (['x' => 'width_mm', 'y' => 'height_mm'] as $axis => $dimension) {
            if (($validated["mounting_anchor_{$axis}_mm"] ?? 0) > $validated[$dimension]) {
                $errors["mounting_anchor_{$axis}_mm"] = ['The mounting anchor must fit inside the component dimensions.'];
            }
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return $validated;
    }

    /** @param array<string, mixed> $reference */
    public static function referenceKey(array $reference): string
    {
        return strtolower($reference['catalog_family_id']).':'.$reference['revision'];
    }

    /** @param array<string, mixed> $left
     * @param  array<string, mixed>  $right
     */
    public static function samePhysicalDefinition(array $left, array $right): bool
    {
        $normalize = static function (array $definition): array {
            $physical = Arr::only($definition, self::PHYSICAL_FIELDS);
            foreach (self::PHYSICAL_FIELDS as $field) {
                $physical[$field] ??= null;
            }
            $physical['mounting_anchor_x_mm'] ??= round($physical['width_mm'] / 2, 2);
            $physical['mounting_anchor_y_mm'] ??= round($physical['height_mm'] / 2, 2);
            $physical = LightingGeometry::normalizeMillimeters($physical);
            $physical['terminals'] = array_map(static fn (array $terminal): array => [
                ...LightingGeometry::normalizeMillimeters($terminal),
                'purpose' => $terminal['purpose'] ?? null,
                'metadata' => (array) ($terminal['metadata'] ?? []),
            ], $physical['terminals']);
            usort($physical['terminals'], static fn (array $a, array $b): int => strcmp($a['key'], $b['key']));

            return $physical;
        };

        return $normalize($left) == $normalize($right);
    }

    /** @param array<string, mixed> $document
     * @param  array<string, array<string, mixed>>  $definitions
     */
    public function validatePhysicalLayout(array $document, array $definitions): void
    {
        $validator = Validator::make([], []);
        StoreLightingDesignRequest::validateMargins($validator, $document['design'], 'document.design.');
        $errors = $validator->errors()->messages();
        $rows = array_column($document['rows'], null, 'portable_id');
        $components = array_column($document['components'], null, 'portable_id');
        $mappedComponents = [];
        foreach ($document['components'] as $index => $component) {
            $key = self::referenceKey($component['catalog_ref']);
            $definition = $definitions[$key];
            $mappedComponents[] = [...$component, 'component_definition_id' => $key];
            $rowId = $component['rail_portable_id'] ?? null;
            $row = $rowId !== null ? ($rows[$rowId] ?? null) : null;
            if ($rowId !== null && $row === null) {
                $errors["document.components.{$index}.rail_portable_id"] = ['The attached row must belong to this layout.'];
            } elseif ($row !== null) {
                if ($definition['mounting_type'] !== 'din-rail' || ! in_array($component['rotation'], [0, 180], true)) {
                    $errors["document.components.{$index}.rail_portable_id"] = ['DIN row devices must use upright DIN mounting.'];
                }
                $anchor = LightingGeometry::rotatedPoint(
                    $definition['mounting_anchor_x_mm'] ?? $definition['width_mm'] / 2,
                    $definition['mounting_anchor_y_mm'] ?? $definition['height_mm'] / 2,
                    $definition['width_mm'], $definition['height_mm'], $component['rotation'],
                );
                $expectedY = $row['y_mm'] + $row['width_mm'] / 2 - $anchor['y_mm'];
                if (abs($component['y_mm'] - $expectedY) > 0.01) {
                    $errors["document.components.{$index}.y_mm"] = ['DIN devices must align with their row mounting line.'];
                }
            }
        }
        foreach (LightingDinPlacement::validateRows($document['rows'], $mappedComponents, $definitions) as $field => $messages) {
            $errors['document.'.$field] = $messages;
        }
        foreach ($document['connections'] as $index => $connection) {
            foreach (['source', 'target'] as $endpoint) {
                $component = $components[$connection["{$endpoint}_portable_id"]] ?? null;
                if ($component === null) {
                    $errors["document.connections.{$index}.{$endpoint}_portable_id"] = ['Connection endpoints must belong to this layout.'];

                    continue;
                }
                $definition = $definitions[self::referenceKey($component['catalog_ref'])];
                $terminal = null;
                foreach ($definition['terminals'] as $candidate) {
                    if ($candidate['key'] === $connection["{$endpoint}_terminal"]) {
                        $terminal = $candidate;
                        break;
                    }
                }
                if ($terminal === null) {
                    $errors["document.connections.{$index}.{$endpoint}_terminal"] = ['Choose a terminal defined by the endpoint component.'];

                    continue;
                }
                $point = LightingGeometry::rotatedPoint((float) $terminal['x_mm'], (float) $terminal['y_mm'], $definition['width_mm'], $definition['height_mm'], $component['rotation']);
                $routePoint = $endpoint === 'source' ? $connection['route_points'][0] : $connection['route_points'][count($connection['route_points']) - 1];
                if (abs($routePoint['x_mm'] - $component['x_mm'] - $point['x_mm']) > 0.01 || abs($routePoint['y_mm'] - $component['y_mm'] - $point['y_mm']) > 0.01) {
                    $errors["document.connections.{$index}.route_points"] = ['Cable routes must start and end at their physical terminal positions.'];
                }
            }
            foreach ($connection['route_points'] as $pointIndex => $point) {
                if ($pointIndex === 0) {
                    continue;
                }
                $previous = $connection['route_points'][$pointIndex - 1];
                if (abs($point['x_mm'] - $previous['x_mm']) > 0.001 && abs($point['y_mm'] - $previous['y_mm']) > 0.001) {
                    $errors["document.connections.{$index}.route_points"] = ['Cable route segments must be orthogonal.'];
                    break;
                }
            }
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }
}
