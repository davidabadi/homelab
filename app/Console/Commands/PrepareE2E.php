<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Database\Seeders\E2ETestSeeder;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;

#[Signature('app:prepare-e2e')]
#[Description('Reset and seed the isolated end-to-end test database')]
class PrepareE2E extends Command
{
    public function handle(): int
    {
        if (! app()->environment(['e2e', 'testing'])) {
            $this->components->error('The E2E database may only be prepared in e2e or testing environments.');

            return self::FAILURE;
        }

        $exitCode = Artisan::call('migrate:fresh', [
            '--force' => true,
            '--seed' => true,
            '--seeder' => E2ETestSeeder::class,
        ]);

        $this->output->write(Artisan::output());

        return $exitCode;
    }
}
