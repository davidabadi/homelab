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

        $database = config('database.connections.sqlite.database');
        $expectedPath = realpath(database_path('e2e.sqlite'));

        if (config('database.default') !== 'sqlite'
            || filled(config('database.connections.sqlite.url'))
            || ! is_string($database)
            || $expectedPath === false
            || realpath($database) !== $expectedPath) {
            $this->components->error('E2E preparation requires the isolated database/e2e.sqlite file and an empty DB_URL.');

            return self::FAILURE;
        }

        $exitCode = Artisan::call('migrate:fresh', [
            '--database' => 'sqlite',
            '--force' => true,
            '--seed' => true,
            '--seeder' => E2ETestSeeder::class,
        ]);

        $this->output->write(Artisan::output());

        return $exitCode;
    }
}
