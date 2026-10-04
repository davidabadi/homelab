<?php

namespace App\Services\Lighting;

class LightingGeometry
{
    /** @param array<string, mixed> $attributes
     * @return array<string, mixed>
     */
    public static function normalizeMillimeters(array $attributes): array
    {
        foreach ($attributes as $key => $value) {
            if (str_ends_with($key, '_mm') && is_numeric($value)) {
                $attributes[$key] = round((float) $value, 2);
            }
        }

        return $attributes;
    }

    /** @return array{x_mm: float, y_mm: float} */
    public static function rotatedPoint(float $x, float $y, float $width, float $height, int $rotation): array
    {
        return match ($rotation) {
            90 => ['x_mm' => $height - $y, 'y_mm' => $x],
            180 => ['x_mm' => $width - $x, 'y_mm' => $height - $y],
            270 => ['x_mm' => $y, 'y_mm' => $width - $x],
            default => ['x_mm' => $x, 'y_mm' => $y],
        };
    }
}
