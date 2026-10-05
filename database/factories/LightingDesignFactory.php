<?php

namespace Database\Factories;

use App\Models\LightingDesign;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<LightingDesign> */
class LightingDesignFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(), 'name' => fake()->words(3, true),
            'width_mm' => 600, 'height_mm' => 800, 'depth_mm' => null,
            'margin_top_mm' => 0, 'margin_right_mm' => 0, 'margin_bottom_mm' => 0,
            'margin_left_mm' => 0, 'grid_size_mm' => 5, 'snap_to_grid' => true,
            'notes' => null, 'metadata' => null, 'save_version' => 0,
        ];
    }
}
