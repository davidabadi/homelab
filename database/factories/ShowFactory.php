<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Show;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Show>
 */
class ShowFactory extends Factory
{
    protected $model = Show::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'title' => fake()->sentence(3),
            'poster_image_url' => 'https://image.tmdb.org/t/p/w500/'.fake()->uuid().'.jpg',
            'overview' => fake()->paragraph(),
            'ended' => false,
        ];
    }

    /**
     * A show TMDB reports as concluded — no more episodes expected.
     */
    public function ended(): static
    {
        return $this->state(['ended' => true]);
    }
}
