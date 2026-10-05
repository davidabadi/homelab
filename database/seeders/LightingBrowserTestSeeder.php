<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;

class LightingBrowserTestSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'e2e', 'testing'])) {
            throw new RuntimeException('Lighting browser fixtures may only be created in local or test environments.');
        }

        $email = 'lighting-browser-tests@example.test';
        $password = Str::password(48);
        $user = User::query()->where('email', $email)->first();

        if ($user !== null && $user->name !== 'Lighting browser test fixture') {
            throw new RuntimeException('The browser fixture email belongs to another account.');
        }

        if ($user === null) {
            $user = User::factory()->create(['name' => 'Lighting browser test fixture', 'email' => $email]);
        }

        $user->forceFill(['password' => Hash::make($password), 'email_verified_at' => now()])->save();
        File::ensureDirectoryExists(base_path('tests/e2e/.auth'));
        File::put(base_path('tests/e2e/.auth/lighting-credentials.json'), json_encode(['email' => $email, 'password' => $password], JSON_THROW_ON_ERROR));
    }
}
