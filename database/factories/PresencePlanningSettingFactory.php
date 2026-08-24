<?php

namespace Database\Factories;

use App\Models\PresencePlanningSetting;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PresencePlanningSetting>
 */
class PresencePlanningSettingFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'default_planning_limit' => fake()->numberBetween(150, 200),
        ];
    }
}
