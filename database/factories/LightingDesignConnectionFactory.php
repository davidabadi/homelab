<?php

namespace Database\Factories;

use App\Models\LightingDesign;
use App\Models\LightingDesignComponent;
use App\Models\LightingDesignConnection;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<LightingDesignConnection> */
class LightingDesignConnectionFactory extends Factory
{
    public function definition(): array
    {
        return [
            'design_id' => LightingDesign::factory(), 'portable_id' => (string) Str::uuid(),
            'source_component_id' => fn (array $attributes): int => LightingDesignComponent::factory()->create(['design_id' => $attributes['design_id']])->id,
            'target_component_id' => fn (array $attributes): int => LightingDesignComponent::factory()->create(['design_id' => $attributes['design_id']])->id,
            'source_terminal' => 'L', 'target_terminal' => 'N', 'cable_type' => 'power', 'color' => '#2563eb', 'gauge' => '1.5 mm²',
            'conductor_count' => 1, 'route_points' => [['x_mm' => 59, 'y_mm' => 50], ['x_mm' => 77, 'y_mm' => 50]],
            'actual_length_mm' => null, 'notes' => null,
        ];
    }
}
