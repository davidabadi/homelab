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

    /**
     * @param  list<array{x_mm: float, y_mm: float}>  $points
     * @param  array{x_mm: float, y_mm: float}  $source
     * @param  array{x_mm: float, y_mm: float}  $target
     * @return list<array{x_mm: float, y_mm: float}>
     */
    public static function updateRouteEndpoints(array $points, array $source, array $target): array
    {
        if (count($points) < 3) {
            $middleX = round(($source['x_mm'] + $target['x_mm']) / 2, 2);

            return self::normalizeOrthogonalRoute([
                $source, ['x_mm' => $middleX, 'y_mm' => $source['y_mm']],
                ['x_mm' => $middleX, 'y_mm' => $target['y_mm']], $target,
            ]);
        }

        $lastIndex = count($points) - 1;
        $second = $points[1];
        $points[1] = $points[0]['y_mm'] == $second['y_mm']
            ? ['x_mm' => $second['x_mm'], 'y_mm' => $source['y_mm']]
            : ['x_mm' => $source['x_mm'], 'y_mm' => $second['y_mm']];
        $penultimate = $points[$lastIndex - 1];
        $points[$lastIndex - 1] = $points[$lastIndex]['y_mm'] == $penultimate['y_mm']
            ? ['x_mm' => $penultimate['x_mm'], 'y_mm' => $target['y_mm']]
            : ['x_mm' => $target['x_mm'], 'y_mm' => $penultimate['y_mm']];
        $points[0] = $source;
        $points[$lastIndex] = $target;

        return self::normalizeOrthogonalRoute($points);
    }

    /**
     * @param  list<array{x_mm: float, y_mm: float}>  $points
     * @return list<array{x_mm: float, y_mm: float}>
     */
    private static function normalizeOrthogonalRoute(array $points): array
    {
        $result = [];
        foreach ($points as $point) {
            $previous = $result !== [] ? $result[count($result) - 1] : null;
            if ($previous !== null && $previous == $point) {
                continue;
            }
            if ($previous !== null && $previous['x_mm'] != $point['x_mm'] && $previous['y_mm'] != $point['y_mm']) {
                $result[] = ['x_mm' => $point['x_mm'], 'y_mm' => $previous['y_mm']];
            }
            $result[] = $point;
            while (count($result) >= 3) {
                [$first, $middle, $last] = array_slice($result, -3);
                $horizontal = $first['y_mm'] == $middle['y_mm'] && $middle['y_mm'] == $last['y_mm']
                    && $middle['x_mm'] >= min($first['x_mm'], $last['x_mm']) && $middle['x_mm'] <= max($first['x_mm'], $last['x_mm']);
                $vertical = $first['x_mm'] == $middle['x_mm'] && $middle['x_mm'] == $last['x_mm']
                    && $middle['y_mm'] >= min($first['y_mm'], $last['y_mm']) && $middle['y_mm'] <= max($first['y_mm'], $last['y_mm']);
                if (! $horizontal && ! $vertical) {
                    break;
                }
                array_splice($result, count($result) - 2, 1);
            }
        }

        return count($result) === 1 && count($points) > 1 ? [$result[0], $result[0]] : $result;
    }
}
