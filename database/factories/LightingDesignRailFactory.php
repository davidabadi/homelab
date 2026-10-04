<?php

namespace Database\Factories;

use App\Models\LightingDesign;
use App\Models\LightingDesignRail;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<LightingDesignRail> */
class LightingDesignRailFactory extends Factory
{
    public function definition(): array
    {
        return [
            'design_id' => LightingDesign::factory(), 'portable_id' => (string) Str::uuid(),
            'component_definition_id' => null, 'x_mm' => 20, 'y_mm' => 100, 'length_mm' => 300, 'width_mm' => 35,
        ];
    }
}
