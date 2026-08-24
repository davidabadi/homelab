<?php

namespace Database\Factories;

use App\Models\ScheduleResource;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<ScheduleResource>
 */
class ScheduleResourceFactory extends Factory
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
            'portable_id' => (string) Str::uuid(),
            'label' => fake()->words(2, true),
            'subtitle' => fake()->optional()->sentence(3),
        ];
    }
}
