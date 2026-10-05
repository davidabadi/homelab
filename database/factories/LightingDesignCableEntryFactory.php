<?php

namespace Database\Factories;

use App\Models\LightingDesign;
use App\Models\LightingDesignCableEntry;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<LightingDesignCableEntry>
 */
class LightingDesignCableEntryFactory extends Factory
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
            'label' => 'Field cables', 'side' => 'top', 'offset_mm' => 20, 'span_mm' => 40,
            'entry_type' => 'gland_plate', 'notes' => null, 'metadata' => null,
        ];
    }
}
