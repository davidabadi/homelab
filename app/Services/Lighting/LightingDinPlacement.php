<?php

namespace App\Services\Lighting;

use App\Models\LightingComponentDefinition;

class LightingDinPlacement
{
    /**
     * @param  list<array<string, mixed>>  $rails
     * @param  list<array<string, mixed>>  $components
     * @param  array<int|string, array<string, mixed>|LightingComponentDefinition>  $definitions
     * @return array<string, list<string>>
     */
    public static function validateRows(array $rails, array $components, array $definitions): array
    {
        $rows = array_column($rails, null, 'portable_id');
        $intervals = [];
        $errors = [];

        foreach ($components as $index => $component) {
            $rowId = $component['rail_portable_id'] ?? null;
            $definition = $definitions[$component['component_definition_id']] ?? null;
            if ($rowId === null || ! isset($rows[$rowId]) || $definition === null
                || data_get($definition, 'mounting_type') !== 'din-rail') {
                continue;
            }

            $start = self::hundredths((float) $component['x_mm']);
            $end = $start + self::hundredths((float) data_get($definition, 'width_mm'));
            $rowStart = self::hundredths((float) $rows[$rowId]['x_mm']);
            $rowEnd = $rowStart + self::hundredths((float) $rows[$rowId]['length_mm']);
            if ($start < $rowStart || $end > $rowEnd) {
                $errors["components.{$index}.x_mm"][] = 'DIN devices must fit inside the usable rail.';
            }
            $intervals[$rowId][] = ['start' => $start, 'end' => $end, 'index' => $index];
        }

        foreach ($intervals as $items) {
            usort($items, static fn (array $left, array $right): int => $left['start'] <=> $right['start']);
            $rightmostEnd = null;
            foreach ($items as $item) {
                if ($rightmostEnd !== null && $item['start'] < $rightmostEnd) {
                    $errors["components.{$item['index']}.x_mm"][] = 'DIN devices on the same row cannot overlap.';
                }
                $rightmostEnd = max($rightmostEnd ?? $item['end'], $item['end']);
            }
        }

        return $errors;
    }

    private static function hundredths(float $millimeters): int
    {
        return (int) round($millimeters * 100);
    }
}
