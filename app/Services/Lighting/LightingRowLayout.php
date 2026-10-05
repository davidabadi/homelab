<?php

namespace App\Services\Lighting;

use App\Models\LightingComponentDefinition;
use App\Models\LightingDesign;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class LightingRowLayout
{
    public const DESIGN_DEFAULTS = [
        'width_mm' => 364, 'height_mm' => 320,
        'margin_top_mm' => 20, 'margin_right_mm' => 20,
        'margin_bottom_mm' => 20, 'margin_left_mm' => 20,
    ];

    public static function createDefaultRows(LightingDesign $design): void
    {
        foreach ([0, 1] as $order) {
            $design->rails()->create([
                'portable_id' => (string) Str::uuid(), 'component_definition_id' => null,
                'sort_order' => $order, 'x_mm' => $design->margin_left_mm,
                'y_mm' => $design->margin_top_mm + $order * 140 + 52.5,
                'length_mm' => $design->width_mm - $design->margin_left_mm - $design->margin_right_mm,
                'width_mm' => 35,
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $layout
     * @param  Collection<int, LightingComponentDefinition>  $definitions
     * @return array<string, mixed>
     */
    public static function normalize(array $layout, Collection $definitions): array
    {
        usort($layout['rails'], static fn (array $left, array $right): int => $left['sort_order'] <=> $right['sort_order']);
        $above = 50.0;
        $below = 50.0;
        foreach ($layout['components'] as $component) {
            $definition = $definitions->get($component['component_definition_id']);
            if (($component['rail_portable_id'] ?? null) === null || $definition?->mounting_type !== 'din-rail') {
                continue;
            }
            $anchor = $definition->mounting_anchor_y_mm ?? $definition->height_mm / 2;
            $above = max($above, $anchor);
            $below = max($below, $definition->height_mm - $anchor);
        }
        $centerOffset = max(70, $above + 20);
        $pitch = max(140, $centerOffset + $below + 20);
        $design = $layout['design'];
        $layout['design']['height_mm'] = round($design['margin_top_mm'] + max(1, count($layout['rails'])) * $pitch + $design['margin_bottom_mm'], 2);

        foreach ($layout['rails'] as $order => &$rail) {
            $rail['sort_order'] = $order;
            $rail['x_mm'] = $design['margin_left_mm'];
            $rail['y_mm'] = round($design['margin_top_mm'] + $order * $pitch + $centerOffset - 17.5, 2);
            $rail['length_mm'] = round($design['width_mm'] - $design['margin_left_mm'] - $design['margin_right_mm'], 2);
            $rail['width_mm'] = 35;

            $indices = array_keys(array_filter($layout['components'], static fn (array $component): bool => ($component['rail_portable_id'] ?? null) === $rail['portable_id']));
            usort($indices, static fn (int $left, int $right): int => $layout['components'][$left]['sort_order'] <=> $layout['components'][$right]['sort_order']);
            $position = $rail['x_mm'];
            foreach ($indices as $itemOrder => $index) {
                $component = &$layout['components'][$index];
                $definition = $definitions->get($component['component_definition_id']);
                if ($definition?->mounting_type !== 'din-rail') {
                    unset($component);

                    continue;
                }
                $component['sort_order'] = $itemOrder;
                $component['x_mm'] = round($position, 2);
                $component['y_mm'] = round($rail['y_mm'] + 17.5 - ($definition->mounting_anchor_y_mm ?? $definition->height_mm / 2), 2);
                $component['rotation'] = 0;
                $position += $definition->width_mm;
                unset($component);
            }
        }
        unset($rail);

        $unassigned = array_keys(array_filter($layout['components'], static fn (array $component): bool => ($component['rail_portable_id'] ?? null) === null));
        usort($unassigned, static fn (int $left, int $right): int => $layout['components'][$left]['sort_order'] <=> $layout['components'][$right]['sort_order']);
        foreach ($unassigned as $order => $index) {
            $layout['components'][$index]['sort_order'] = $order;
        }

        $components = [];
        foreach ($layout['components'] as $component) {
            $components[$component['portable_id']] = $component;
        }
        foreach ($layout['connections'] as &$connection) {
            $endpoints = [];
            foreach (['source', 'target'] as $endpoint) {
                $component = $components[$connection["{$endpoint}_portable_id"]] ?? null;
                $definition = $component !== null ? $definitions->get($component['component_definition_id']) : null;
                $terminal = $definition !== null ? collect($definition->terminals)->firstWhere('key', $connection["{$endpoint}_terminal"]) : null;
                if ($component === null || $terminal === null) {
                    continue;
                }
                $point = LightingGeometry::rotatedPoint((float) $terminal['x_mm'], (float) $terminal['y_mm'], $definition->width_mm, $definition->height_mm, $component['rotation']);
                $endpoints[$endpoint] = [
                    'x_mm' => round($component['x_mm'] + $point['x_mm'], 2),
                    'y_mm' => round($component['y_mm'] + $point['y_mm'], 2),
                ];
            }
            if (! isset($endpoints['source'], $endpoints['target'])) {
                continue;
            }
            $points = $connection['route_points'];
            if ($points[0] == $endpoints['source'] && $points[count($points) - 1] == $endpoints['target']) {
                continue;
            }
            $connection['route_points'] = LightingGeometry::updateRouteEndpoints($points, $endpoints['source'], $endpoints['target']);
        }
        unset($connection);

        return $layout;
    }
}
