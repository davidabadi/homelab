<?php

namespace Database\Factories;

use App\Enums\PresenceTripStatus;
use App\Models\PresenceTrip;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PresenceTrip>
 */
class PresenceTripFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $entryDate = CarbonImmutable::instance(fake()->dateTimeBetween('-2 years', '+1 year'));

        return [
            'user_id' => User::factory(),
            'entry_date' => $entryDate->toDateString(),
            'exit_date' => $entryDate->addDays(fake()->numberBetween(0, 21))->toDateString(),
            'status' => fake()->randomElement(PresenceTripStatus::cases()),
            'notes' => fake()->optional()->sentence(),
        ];
    }
}
