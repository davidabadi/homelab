<?php

namespace App\Services\Lighting;

class LightingCablingLayout
{
    public const GROUPS = ['cable_entries', 'cable_bundles', 'external_cables'];

    public const CLASSES = ['line_voltage', 'low_voltage_control', 'data', 'other'];

    public const DIRECTIONS = ['incoming', 'outgoing', 'mixed'];

    /** @param array<string, mixed> $layout
     * @param  array<int|string, array<string, mixed>>  $definitions
     * @return array<string, list<string>>
     */
    public static function validate(array $layout, array $definitions, string $prefix = ''): array
    {
        $errors = [];
        $entries = array_column($layout['cable_entries'], null, 'portable_id');
        $bundles = array_column($layout['cable_bundles'], null, 'portable_id');
        $components = array_column($layout['components'], null, 'portable_id');
        foreach ($layout['cable_entries'] as $index => $entry) {
            $length = in_array($entry['side'], ['top', 'bottom'], true) ? $layout['design']['width_mm'] : $layout['design']['height_mm'];
            if ($length + 0.001 < $entry['offset_mm'] + $entry['span_mm']) {
                $errors[$prefix."cable_entries.{$index}.offset_mm"] = ['The cable entry must fit on its enclosure side.'];
            }
        }
        foreach ($layout['cable_bundles'] as $index => $bundle) {
            $entry = $entries[$bundle['cable_entry_portable_id']] ?? null;
            if ($entry === null) {
                $errors[$prefix."cable_bundles.{$index}.cable_entry_portable_id"] = ['The cable entry must belong to this layout.'];
            } elseif (! self::samePoint($bundle['route_points'][0], LightingGeometry::cableEntryPoint($entry, $layout['design']))) {
                $errors[$prefix."cable_bundles.{$index}.route_points"] = ['Bundle routes must start at their physical cable entry.'];
            }
            if (! self::orthogonal($bundle['route_points'])) {
                $errors[$prefix."cable_bundles.{$index}.route_points"] = ['Cable route segments must be orthogonal.'];
            }
        }
        foreach ($layout['external_cables'] as $index => $cable) {
            $field = $prefix."external_cables.{$index}.";
            $bundleId = $cable['bundle_portable_id'] ?? null;
            $entryId = $cable['cable_entry_portable_id'] ?? null;
            if (($bundleId === null) === ($entryId === null)) {
                $errors[$field.'bundle_portable_id'] = ['Choose exactly one cable origin: a bundle or a cable entry.'];
            }
            $bundle = $bundleId !== null ? ($bundles[$bundleId] ?? null) : null;
            $entry = $entryId !== null ? ($entries[$entryId] ?? null) : null;
            if ($bundleId !== null && $bundle === null) {
                $errors[$field.'bundle_portable_id'] = ['The cable bundle must belong to this layout.'];
            }
            if ($entryId !== null && $entry === null) {
                $errors[$field.'cable_entry_portable_id'] = ['The cable entry must belong to this layout.'];
            }
            foreach (['cable_class', 'direction'] as $attribute) {
                if ($bundleId !== null && ($cable[$attribute] ?? null) !== null) {
                    $errors[$field.$attribute] = ['Bundled cables inherit their class and direction from the bundle.'];
                } elseif ($bundleId === null && ($cable[$attribute] ?? null) === null) {
                    $errors[$field.$attribute] = ['Standalone cables need a cable class and direction.'];
                }
            }
            $componentId = $cable['internal_component_portable_id'] ?? null;
            $terminalKey = $cable['internal_terminal'] ?? null;
            if (($componentId === null) !== ($terminalKey === null)) {
                $errors[$field.'internal_terminal'] = ['Choose both an internal component and its terminal, or leave both unassigned.'];
            }
            $target = null;
            if ($componentId !== null) {
                $component = $components[$componentId] ?? null;
                if ($component === null) {
                    $errors[$field.'internal_component_portable_id'] = ['The internal component must belong to this layout.'];
                } elseif ($terminalKey !== null) {
                    $definition = $definitions[$component['component_definition_id']] ?? null;
                    $target = $definition !== null ? LightingGeometry::terminalPoint($component, $definition, $terminalKey) : null;
                    if ($target === null) {
                        $errors[$field.'internal_terminal'] = ['Choose a terminal defined by the internal component.'];
                    }
                }
            }
            $points = $cable['branch_route_points'];
            if ($target !== null && count($points) < 2) {
                $errors[$field.'branch_route_points'] = ['Assigned cables need a route to their internal terminal.'];
            }
            if ($points !== [] && count($points) < 2) {
                $errors[$field.'branch_route_points'] = ['A cable route needs at least two points.'];
            }
            $source = $bundle !== null ? self::breakoutPoint($bundle) : ($entry !== null ? LightingGeometry::cableEntryPoint($entry, $layout['design']) : null);
            if ($points !== [] && $source !== null && ! self::samePoint($points[0], $source)) {
                $errors[$field.'branch_route_points'] = ['Cable branches must start at their bundle breakout or standalone cable entry.'];
            }
            if ($points !== [] && $target !== null && ! self::samePoint($points[count($points) - 1], $target)) {
                $errors[$field.'branch_route_points'] = ['Assigned cable branches must end at their physical internal terminal.'];
            }
            if (! self::orthogonal($points)) {
                $errors[$field.'branch_route_points'] = ['Cable route segments must be orthogonal.'];
            }
        }

        return $errors;
    }

    /** @param array<string, mixed> $layout
     * @param  array<int|string, array<string, mixed>>  $definitions
     * @return array<string, mixed>
     */
    public static function normalize(array $layout, array $definitions): array
    {
        $entries = array_column($layout['cable_entries'], null, 'portable_id');
        foreach ($layout['cable_bundles'] as &$bundle) {
            $entry = $entries[$bundle['cable_entry_portable_id']] ?? null;
            if ($entry !== null) {
                $source = LightingGeometry::cableEntryPoint($entry, $layout['design']);
                $target = self::breakoutPoint($bundle);
                if (! self::samePoint($bundle['route_points'][0], $source)) {
                    $bundle['route_points'] = LightingGeometry::updateRouteEndpoints($bundle['route_points'], $source, $target);
                }
            }
        }
        unset($bundle);
        $bundles = array_column($layout['cable_bundles'], null, 'portable_id');
        $components = array_column($layout['components'], null, 'portable_id');
        foreach ($layout['external_cables'] as &$cable) {
            $points = $cable['branch_route_points'];
            if (count($points) < 2) {
                continue;
            }
            $bundle = $bundles[$cable['bundle_portable_id'] ?? ''] ?? null;
            $entry = $entries[$cable['cable_entry_portable_id'] ?? ''] ?? null;
            $source = $bundle !== null ? self::breakoutPoint($bundle) : ($entry !== null ? LightingGeometry::cableEntryPoint($entry, $layout['design']) : null);
            $component = $components[$cable['internal_component_portable_id'] ?? ''] ?? null;
            $definition = $component !== null ? ($definitions[$component['component_definition_id']] ?? null) : null;
            $target = $component !== null && $definition !== null && ($cable['internal_terminal'] ?? null) !== null
                ? LightingGeometry::terminalPoint($component, $definition, $cable['internal_terminal']) : $points[count($points) - 1];
            if ($source !== null && $target !== null && (! self::samePoint($points[0], $source) || ! self::samePoint($points[count($points) - 1], $target))) {
                $cable['branch_route_points'] = LightingGeometry::updateRouteEndpoints($points, $source, $target);
            }
        }
        unset($cable);

        return $layout;
    }

    /** @param array{route_points: list<array{x_mm: float|int, y_mm: float|int}>} $bundle
     * @return array{x_mm: float|int, y_mm: float|int}
     */
    public static function breakoutPoint(array $bundle): array
    {
        return $bundle['route_points'][count($bundle['route_points']) - 1];
    }

    /** @param list<array{x_mm: float|int, y_mm: float|int}> $points */
    public static function orthogonal(array $points): bool
    {
        foreach ($points as $index => $point) {
            if ($index > 0 && abs($point['x_mm'] - $points[$index - 1]['x_mm']) > 0.001 && abs($point['y_mm'] - $points[$index - 1]['y_mm']) > 0.001) {
                return false;
            }
        }

        return true;
    }

    /** @param array{x_mm: float|int, y_mm: float|int} $left
     * @param  array{x_mm: float|int, y_mm: float|int}  $right
     */
    private static function samePoint(array $left, array $right): bool
    {
        return abs($left['x_mm'] - $right['x_mm']) <= 0.01 && abs($left['y_mm'] - $right['y_mm']) <= 0.01;
    }
}
