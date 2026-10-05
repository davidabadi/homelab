<?php

namespace App\Http\Requests;

use App\Models\LightingComponentDefinition;
use App\Models\LightingDesign;
use App\Services\Lighting\LightingDinPlacement;
use App\Services\Lighting\LightingGeometry;
use App\Services\Lighting\LightingRowLayout;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class SaveLightingLayoutRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_array($this->input('design'))) {
            $this->merge(['design' => LightingGeometry::normalizeMillimeters($this->input('design'))]);
        }
        foreach (['components', 'rails', 'ducts', 'connections'] as $group) {
            if (! is_array($this->input($group))) {
                continue;
            }
            $items = array_map(static function (mixed $item): mixed {
                if (! is_array($item)) {
                    return $item;
                }
                $item = LightingGeometry::normalizeMillimeters($item);
                if (isset($item['route_points']) && is_array($item['route_points'])) {
                    $item['route_points'] = array_map(
                        static fn (mixed $point): mixed => is_array($point) ? LightingGeometry::normalizeMillimeters($point) : $point,
                        $item['route_points'],
                    );
                }

                return $item;
            }, $this->input($group));
            $this->merge([$group => $items]);
        }
    }

    public function authorize(): bool
    {
        if ($this->user() === null) {
            return false;
        }
        $this->user()->lightingDesigns()->findOrFail($this->route('design'));

        return true;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $position = ['required', 'numeric', 'between:-1000000,1000000'];
        $definition = ['nullable', 'integer', Rule::exists('lighting_component_definitions', 'id')];

        return [
            'base_version' => ['required', 'integer', 'min:0'],
            'mutation_id' => ['required', 'uuid'],
            'structured' => ['sometimes', 'boolean'],
            'design' => ['required', 'array:'.implode(',', LightingDesign::EDITABLE_FIELDS)],
            ...StoreLightingDesignRequest::designRules('design.', complete: true),
            'components' => ['present', 'array', 'list', 'max:2000'],
            'components.*' => ['array:portable_id,component_definition_id,sort_order,x_mm,y_mm,rotation,custom_label,rail_portable_id,notes,metadata'],
            'components.*.portable_id' => ['required', 'uuid', 'distinct'],
            'components.*.component_definition_id' => ['required', 'integer', Rule::exists('lighting_component_definitions', 'id')],
            'components.*.sort_order' => ['required_if:structured,true', 'integer', 'min:0', 'max:2000'],
            'components.*.x_mm' => $position,
            'components.*.y_mm' => $position,
            'components.*.rotation' => ['required', 'integer', Rule::in([0, 90, 180, 270])],
            'components.*.custom_label' => ['nullable', 'string', 'max:255'],
            'components.*.rail_portable_id' => ['nullable', 'uuid'],
            'components.*.notes' => ['nullable', 'string', 'max:10000'],
            'components.*.metadata' => ['nullable', 'array'],
            'rails' => ['present', 'array', 'list', 'max:500'],
            'rails.*' => ['array:portable_id,component_definition_id,sort_order,x_mm,y_mm,length_mm,width_mm'],
            'rails.*.portable_id' => ['required', 'uuid', 'distinct'],
            'rails.*.component_definition_id' => $definition,
            'rails.*.sort_order' => ['required_if:structured,true', 'integer', 'min:0', 'max:500'],
            'rails.*.x_mm' => $position,
            'rails.*.y_mm' => $position,
            'rails.*.length_mm' => ['required', 'numeric', 'min:0.01', 'max:1000000'],
            'rails.*.width_mm' => ['required', 'numeric', 'min:0.01', 'max:1000000'],
            'ducts' => ['present', 'array', 'list', 'max:500'],
            'ducts.*' => ['array:portable_id,component_definition_id,x_mm,y_mm,length_mm,width_mm,orientation'],
            'ducts.*.portable_id' => ['required', 'uuid', 'distinct'],
            'ducts.*.component_definition_id' => $definition,
            'ducts.*.x_mm' => $position,
            'ducts.*.y_mm' => $position,
            'ducts.*.length_mm' => ['required', 'numeric', 'min:0.01', 'max:1000000'],
            'ducts.*.width_mm' => ['required', 'numeric', 'min:0.01', 'max:1000000'],
            'ducts.*.orientation' => ['required', Rule::in(['horizontal', 'vertical'])],
            'connections' => ['present', 'array', 'list', 'max:5000'],
            'connections.*' => ['array:portable_id,source_portable_id,source_terminal,target_portable_id,target_terminal,cable_type,color,gauge,conductor_count,route_points,actual_length_mm,notes'],
            'connections.*.portable_id' => ['required', 'uuid', 'distinct'],
            'connections.*.source_portable_id' => ['required', 'uuid'],
            'connections.*.source_terminal' => ['required', 'string', 'max:100'],
            'connections.*.target_portable_id' => ['required', 'uuid'],
            'connections.*.target_terminal' => ['required', 'string', 'max:100'],
            'connections.*.cable_type' => ['required', 'string', 'max:255'],
            'connections.*.color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'connections.*.gauge' => ['nullable', 'string', 'max:100'],
            'connections.*.conductor_count' => ['required', 'integer', 'between:1,1000'],
            'connections.*.route_points' => ['required', 'array', 'list', 'min:2', 'max:500'],
            'connections.*.route_points.*' => ['array:x_mm,y_mm'],
            'connections.*.route_points.*.x_mm' => $position,
            'connections.*.route_points.*.y_mm' => $position,
            'connections.*.actual_length_mm' => ['nullable', 'numeric', 'min:0', 'max:100000000'],
            'connections.*.notes' => ['nullable', 'string', 'max:10000'],
        ];
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }
                $portableIds = [];
                foreach (['components', 'rails', 'ducts', 'connections'] as $group) {
                    foreach ($this->input($group) as $index => $item) {
                        if (isset($portableIds[$item['portable_id']])) {
                            $validator->errors()->add("{$group}.{$index}.portable_id", 'Object identifiers must be unique across the layout.');
                        }
                        $portableIds[$item['portable_id']] = true;
                    }
                }
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }
                $components = collect($this->array('components'))->keyBy('portable_id');
                $railIds = array_column($this->input('rails'), 'portable_id');
                $rails = collect($this->array('rails'))->keyBy('portable_id');
                $definitions = LightingComponentDefinition::query()->whereIn('id', collect([
                    ...$this->input('components'), ...$this->input('rails'), ...$this->input('ducts'),
                ])->pluck('component_definition_id')->filter()->unique())->get()->keyBy('id');

                if ($this->boolean('structured')) {
                    $this->normalizeRows($validator, $definitions);
                    if ($validator->errors()->isNotEmpty()) {
                        return;
                    }
                    $components = collect($this->array('components'))->keyBy('portable_id');
                    $railIds = array_column($this->input('rails'), 'portable_id');
                    $rails = collect($this->array('rails'))->keyBy('portable_id');
                }
                StoreLightingDesignRequest::validateMargins($validator, $this->input('design'), 'design.');
                foreach (LightingDinPlacement::validateRows($this->array('rails'), $this->array('components'), $definitions->all()) as $key => $messages) {
                    foreach ($messages as $message) {
                        $validator->errors()->add($key, $message);
                    }
                }

                foreach (['components' => 'component', 'rails' => 'rail', 'ducts' => 'duct'] as $group => $kind) {
                    foreach ($this->input($group) as $index => $item) {
                        $definition = $definitions->get($item['component_definition_id'] ?? null);
                        if ($definition !== null && $definition->kind !== $kind) {
                            $validator->errors()->add("{$group}.{$index}.component_definition_id", 'The catalog kind does not match this layout object.');
                        }
                    }
                }

                foreach ($this->input('components') as $index => $component) {
                    $rail = $component['rail_portable_id'] ?? null;
                    if ($rail !== null && ! in_array($rail, $railIds, true)) {
                        $validator->errors()->add("components.{$index}.rail_portable_id", 'The attached rail must belong to this layout.');
                    }
                    if ($rail !== null && ($definitions->get($component['component_definition_id'])?->mounting_type !== 'din-rail' || in_array($component['rotation'], [90, 270], true))) {
                        $validator->errors()->add("components.{$index}.rail_portable_id", 'Only an upright DIN-mounted component may attach to a rail.');
                    }
                    $attachedRail = $rail !== null ? $rails->get($rail) : null;
                    $definition = $definitions->get($component['component_definition_id']);
                    if ($attachedRail !== null && $definition !== null) {
                        $anchor = LightingGeometry::rotatedPoint(
                            $definition->mounting_anchor_x_mm ?? $definition->width_mm / 2, $definition->mounting_anchor_y_mm ?? $definition->height_mm / 2,
                            $definition->width_mm, $definition->height_mm, $component['rotation'],
                        );
                        $expectedY = $attachedRail['y_mm'] + $attachedRail['width_mm'] / 2 - $anchor['y_mm'];
                        if ($component['x_mm'] < $attachedRail['x_mm'] - 0.01
                            || $component['x_mm'] + $definition->width_mm > $attachedRail['x_mm'] + $attachedRail['length_mm'] + 0.01
                            || abs($component['y_mm'] - $expectedY) > 0.01) {
                            $validator->errors()->add("components.{$index}.rail_portable_id", 'Attached components must align with the mounting line and fit along the rail.');
                        }
                    }
                }

                foreach ($this->input('connections') as $index => $connection) {
                    foreach (['source', 'target'] as $endpoint) {
                        $component = $components->get($connection["{$endpoint}_portable_id"]);
                        if ($component === null) {
                            $validator->errors()->add("connections.{$index}.{$endpoint}_portable_id", 'Connection endpoints must belong to this layout.');

                            continue;
                        }
                        $terminalKeys = array_column($definitions->get($component['component_definition_id'])->terminals, 'key');
                        if (! in_array($connection["{$endpoint}_terminal"], $terminalKeys, true)) {
                            $validator->errors()->add("connections.{$index}.{$endpoint}_terminal", 'Choose a terminal defined by the endpoint component.');

                            continue;
                        }
                        $definition = $definitions->get($component['component_definition_id']);
                        $terminal = collect($definition->terminals)->firstWhere('key', $connection["{$endpoint}_terminal"]);
                        $anchor = LightingGeometry::rotatedPoint(
                            (float) $terminal['x_mm'], (float) $terminal['y_mm'],
                            $definition->width_mm, $definition->height_mm, $component['rotation'],
                        );
                        $routeEndpoint = $endpoint === 'source' ? $connection['route_points'][0] : $connection['route_points'][count($connection['route_points']) - 1];
                        if (abs($routeEndpoint['x_mm'] - $component['x_mm'] - $anchor['x_mm']) > 0.01
                            || abs($routeEndpoint['y_mm'] - $component['y_mm'] - $anchor['y_mm']) > 0.01) {
                            $validator->errors()->add("connections.{$index}.route_points", 'Cable routes must start and end at their physical terminal positions.');
                        }
                    }
                    $points = $connection['route_points'];
                    for ($point = 1; $point < count($points); $point++) {
                        if (abs($points[$point]['x_mm'] - $points[$point - 1]['x_mm']) > 0.001 && abs($points[$point]['y_mm'] - $points[$point - 1]['y_mm']) > 0.001) {
                            $validator->errors()->add("connections.{$index}.route_points", 'Cable route segments must be orthogonal.');
                            break;
                        }
                    }
                }
            },
        ];
    }

    /** @param Collection<int, LightingComponentDefinition> $definitions */
    private function normalizeRows(Validator $validator, Collection $definitions): void
    {
        $rowOrders = [];
        $itemOrders = [];
        foreach ($this->input('rails') as $index => $rail) {
            if (isset($rowOrders[$rail['sort_order']])) {
                $validator->errors()->add("rails.{$index}.sort_order", 'Each row must have a unique order.');
            }
            $rowOrders[$rail['sort_order']] = true;
        }
        foreach ($this->input('components') as $index => $component) {
            $rowId = $component['rail_portable_id'] ?? 'unassigned';
            if (isset($itemOrders[$rowId][$component['sort_order']])) {
                $validator->errors()->add("components.{$index}.sort_order", 'Each device must have a unique order within its row.');
            }
            $itemOrders[$rowId][$component['sort_order']] = true;
        }
        $capacity = $this->input('design.width_mm') - $this->input('design.margin_left_mm') - $this->input('design.margin_right_mm');
        foreach ($this->input('rails') as $index => $rail) {
            $usedWidth = 0;
            foreach ($this->input('components') as $component) {
                if (($component['rail_portable_id'] ?? null) === $rail['portable_id']) {
                    $usedWidth += $definitions->get($component['component_definition_id'])->width_mm;
                }
            }
            if ($usedWidth > $capacity + 0.01) {
                $validator->errors()->add("rails.{$index}.length_mm", 'The devices exceed this row’s usable width. Move a device to another row or increase the panel width.');
            }
        }
        if ($validator->errors()->isNotEmpty()) {
            return;
        }

        $layout = LightingRowLayout::normalize($validator->getData(), $definitions);
        if ($layout['design']['height_mm'] > 1000000) {
            $validator->errors()->add('design.height_mm', 'The rows exceed the supported panel height. Reduce the number of rows or device height.');

            return;
        }
        $this->merge($layout);
        $validator->setData($layout);
    }
}
