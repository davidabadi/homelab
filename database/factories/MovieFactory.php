<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Movie;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Movie>
 */
class MovieFactory extends Factory
{
    protected $model = Movie::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'title' => fake()->sentence(3),
            'poster_image_url' => 'https://image.tmdb.org/t/p/w500/'.fake()->uuid().'.jpg',
            'overview' => fake()->paragraph(),
            'release_date' => fake()->date(),
            'runtime_minutes' => fake()->numberBetween(80, 180),
        ];
    }
}
