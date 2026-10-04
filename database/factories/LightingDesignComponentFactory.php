<?php

namespace Database\Factories;

use App\Models\LightingComponentDefinition;
use App\Models\LightingDesign;
use App\Models\LightingDesignComponent;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<LightingDesignComponent> */
class LightingDesignComponentFactory extends Factory
{
    public function definition(): array
    {
        return [
            'design_id' => LightingDesign::factory(), 'portable_id' => (string) Str::uuid(),
            'component_definition_id' => LightingComponentDefinition::factory(), 'rail_id' => null,
            'x_mm' => 50, 'y_mm' => 50, 'rotation' => 0, 'custom_label' => null, 'notes' => null, 'metadata' => [],
        ];
    }
}
