<?php

namespace Database\Factories;

use App\Models\ScheduleJob;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<ScheduleJob>
 */
class ScheduleJobFactory extends Factory
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
            'name' => fake()->words(3, true),
            'start_time' => fake()->time('H:i'),
            'duration_minutes' => fake()->numberBetween(5, 240),
            'weekdays' => [fake()->numberBetween(0, 6)],
            'notes' => fake()->optional()->sentence(),
        ];
    }

    /** @param list<int> $weekdays */
    public function onWeekdays(array $weekdays): static
    {
        return $this->state(fn (): array => ['weekdays' => $weekdays]);
    }
}
