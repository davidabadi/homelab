<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Episode;
use App\Models\Show;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Episode>
 */
class EpisodeFactory extends Factory
{
    protected $model = Episode::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'show_id' => Show::factory(),
            'season_number' => 1,
            'episode_number' => fake()->numberBetween(1, 24),
            'title' => fake()->sentence(3),
            'still_image_url' => 'https://image.tmdb.org/t/p/w300/'.fake()->uuid().'.jpg',
            'overview' => fake()->paragraph(),
            'air_date' => fake()->dateTimeBetween('-2 years', '-1 week')->format('Y-m-d'),
            'runtime_minutes' => fake()->numberBetween(20, 60),
        ];
    }
}
