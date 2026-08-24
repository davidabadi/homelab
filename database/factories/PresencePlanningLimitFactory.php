<?php

namespace Database\Factories;

use App\Models\PresencePlanningLimit;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PresencePlanningLimit>
 */
class PresencePlanningLimitFactory extends Factory
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
            'year' => fake()->numberBetween(2000, 2100),
            'planning_limit' => fake()->numberBetween(150, 200),
        ];
    }
}
