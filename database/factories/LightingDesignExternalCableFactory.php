<?php

namespace Database\Factories;

use App\Models\LightingDesign;
use App\Models\LightingDesignCableBundle;
use App\Models\LightingDesignExternalCable;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<LightingDesignExternalCable>
 */
class LightingDesignExternalCableFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'design_id' => LightingDesign::factory(), 'portable_id' => (string) Str::uuid(),
            'bundle_id' => fn (array $attributes): int => LightingDesignCableBundle::factory()->create(['design_id' => $attributes['design_id']])->id,
            'cable_entry_id' => null, 'label' => 'Bedroom keypad', 'cable_type' => 'Control',
            'gauge' => null, 'conductor_count' => 4, 'internal_component_id' => null,
            'internal_terminal' => null, 'branch_route_points' => [], 'cable_class' => null,
            'direction' => null, 'notes' => null, 'metadata' => null,
        ];
    }
}
