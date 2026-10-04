<?php

namespace Database\Factories;

use App\Models\LightingComponentDefinition;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<LightingComponentDefinition> */
class LightingComponentDefinitionFactory extends Factory
{
    public function definition(): array
    {
        return [
            'catalog_family_id' => (string) Str::uuid(), 'revision' => 1,
            'manufacturer' => 'Sample', 'model' => 'DIN-36', 'display_name' => 'Sample DIN device',
            'category' => 'relay', 'kind' => 'component', 'sku' => null,
            'width_mm' => 36, 'height_mm' => 90, 'depth_mm' => 60,
            'din_modules' => 2, 'mounting_type' => 'din-rail',
            'mounting_anchor_x_mm' => 18, 'mounting_anchor_y_mm' => 45,
            'image_path' => null, 'image_url' => null, 'datasheet_url' => null,
            'description' => 'Sample dimensions for testing.',
            'terminals' => [
                ['key' => 'L', 'label' => 'L', 'x_mm' => 9, 'y_mm' => 0, 'side' => 'top', 'purpose' => 'power'],
                ['key' => 'N', 'label' => 'N', 'x_mm' => 27, 'y_mm' => 0, 'side' => 'top', 'purpose' => 'neutral'],
            ],
            'metadata' => ['sample_dimensions' => true], 'archived_at' => null,
        ];
    }

    public function rail(): static
    {
        return $this->state(fn (): array => [
            'kind' => 'rail', 'category' => 'din-rail', 'mounting_type' => 'panel',
            'width_mm' => 300, 'height_mm' => 35, 'mounting_anchor_x_mm' => 150,
            'mounting_anchor_y_mm' => 17.5, 'terminals' => [],
        ]);
    }

    public function duct(): static
    {
        return $this->state(fn (): array => [
            'kind' => 'duct', 'category' => 'wire-duct', 'mounting_type' => 'panel',
            'width_mm' => 300, 'height_mm' => 40, 'mounting_anchor_x_mm' => 150,
            'mounting_anchor_y_mm' => 20, 'terminals' => [],
        ]);
    }
}
