<?php

namespace Database\Factories;

use App\Enums\YamtrackImportStatus;
use App\Enums\YamtrackImportStrategy;
use App\Models\User;
use App\Models\YamtrackImport;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<YamtrackImport>
 */
class YamtrackImportFactory extends Factory
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
            'active_user_id' => null,
            'strategy' => YamtrackImportStrategy::AddMissing,
            'status' => YamtrackImportStatus::Completed,
            'original_filename' => 'yamtrack.csv',
            'stored_path' => 'yamtrack-imports/test.csv',
            'file_hash' => str_repeat('a', 64),
        ];
    }
}
