<?php

namespace Database\Factories;

use App\Models\LightingDesign;
use App\Models\LightingDesignCableBundle;
use App\Models\LightingDesignCableEntry;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<LightingDesignCableBundle>
 */
class LightingDesignCableBundleFactory extends Factory
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
            'cable_entry_id' => fn (array $attributes): int => LightingDesignCableEntry::factory()->create(['design_id' => $attributes['design_id']])->id,
            'name' => 'Keypads', 'external_location' => 'Rooms', 'cable_class' => 'low_voltage_control',
            'direction' => 'incoming', 'display_color' => '#2dd4bf', 'planned_count' => 8,
            'route_points' => [['x_mm' => 40, 'y_mm' => 0], ['x_mm' => 40, 'y_mm' => 100]],
            'notes' => null, 'metadata' => null,
        ];
    }
}
