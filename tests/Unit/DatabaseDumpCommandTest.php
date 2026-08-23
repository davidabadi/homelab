<?php

use Illuminate\Filesystem\Filesystem;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use Tests\TestCase;

use function Pest\Laravel\mock;

uses(TestCase::class);

beforeEach(function () {
    $this->dumpDirectory = storage_path('framework/testing/database-dumps-'.Str::random(12));
    config([
        'database.default' => 'dump_testing',
        'database.connections.dump_testing' => [
            'driver' => 'pgsql',
            'host' => 'database.internal',
            'port' => '5544',
            'database' => 'tracker production',
            'username' => 'backup-user',
            'password' => 'super-secret-password',
            'charset' => 'utf8',
            'prefix' => '',
            'search_path' => 'public',
            'sslmode' => 'require',
        ],
        'database-dumps.directory' => $this->dumpDirectory,
        'database-dumps.retention_days' => 7,
    ]);
    DB::purge('dump_testing');
});

afterEach(function () {
    Carbon::setTestNow();
    Cache::lock('database-dumps:running')->forceRelease();
    File::deleteDirectory($this->dumpDirectory);
    DB::purge('dump_testing');
    config(['database.default' => 'sqlite']);
});

test('a successful dump is finalized with the expected connection arguments and secure environment', function () {
    Carbon::setTestNow('2026-07-14 02:00:00');

    Process::fake(function (PendingProcess $process) {
        $fileArgument = array_search('--file', $process->command, true);
        File::put($process->command[$fileArgument + 1], 'plain SQL dump');

        return Process::result();
    });

    $expectedPath = $this->dumpDirectory.DIRECTORY_SEPARATOR.'tracker-production-2026-07-14_020000.sql';

    $this->artisan('app:dump-database')
        ->expectsOutputToContain($expectedPath)
        ->doesntExpectOutputToContain('super-secret-password')
        ->assertSuccessful();

    expect(File::get($expectedPath))->toBe('plain SQL dump')
        ->and(File::glob($this->dumpDirectory.DIRECTORY_SEPARATOR.'*.tmp'))->toBe([]);

    Process::assertRan(function (PendingProcess $process): bool {
        expect($process->command)->toBe([
            'pg_dump',
            '--host',
            'database.internal',
            '--port',
            '5544',
            '--username',
            'backup-user',
            '--dbname',
            'tracker production',
            '--format',
            'plain',
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-password',
            '--file',
            $process->command[16],
        ])->not->toContain('super-secret-password')
            ->and($process->environment)->toMatchArray([
                'PGPASSWORD' => 'super-secret-password',
                'PGSSLMODE' => 'require',
            ]);

        return true;
    });
});

test('a failed pg dump returns failure, redacts the password, and removes its temporary file', function () {
    Carbon::setTestNow('2026-07-14 02:00:00');
    File::ensureDirectoryExists($this->dumpDirectory);
    $expiredDump = $this->dumpDirectory.DIRECTORY_SEPARATOR.'tracker-production-2026-07-01_020000.sql';
    File::put($expiredDump, 'completed old dump');
    touch($expiredDump, now()->startOfDay()->subDays(8)->getTimestamp());

    Process::fake(function (PendingProcess $process) {
        $fileArgument = array_search('--file', $process->command, true);
        File::put($process->command[$fileArgument + 1], 'incomplete dump');

        return Process::result(
            errorOutput: 'authentication failed for super-secret-password',
            exitCode: 1,
        );
    });

    $this->artisan('app:dump-database')
        ->expectsOutputToContain('authentication failed for [REDACTED]')
        ->doesntExpectOutputToContain('super-secret-password')
        ->assertFailed();

    expect(File::exists($expiredDump))->toBeTrue()
        ->and(File::glob($this->dumpDirectory.DIRECTORY_SEPARATOR.'*.tmp'))->toBe([]);
});

test('completed dumps older than the retention cutoff are removed after a successful dump', function () {
    Carbon::setTestNow('2026-07-14 14:30:00');
    File::ensureDirectoryExists($this->dumpDirectory);

    $expiredDump = $this->dumpDirectory.DIRECTORY_SEPARATOR.'tracker-production-2026-07-06_020000.sql';
    $boundaryDump = $this->dumpDirectory.DIRECTORY_SEPARATOR.'tracker-production-2026-07-07_000000.sql';
    $temporaryFile = $this->dumpDirectory.DIRECTORY_SEPARATOR.'.tracker-production-old.tmp';
    $unrelatedFile = $this->dumpDirectory.DIRECTORY_SEPARATOR.'notes.txt';

    File::put($expiredDump, 'expired dump');
    File::put($boundaryDump, 'retained dump');
    File::put($temporaryFile, 'incomplete dump');
    File::put($unrelatedFile, 'backup notes');

    $cutoffTimestamp = now()->startOfDay()->subDays(7)->getTimestamp();
    touch($expiredDump, $cutoffTimestamp - 1);
    touch($boundaryDump, $cutoffTimestamp);
    touch($temporaryFile, $cutoffTimestamp - 1);
    touch($unrelatedFile, $cutoffTimestamp - 1);

    Process::fake(function (PendingProcess $process) {
        $fileArgument = array_search('--file', $process->command, true);
        File::put($process->command[$fileArgument + 1], 'new plain SQL dump');

        return Process::result();
    });

    $this->artisan('app:dump-database')
        ->expectsOutputToContain('Removed 1 expired database dump.')
        ->assertSuccessful();

    expect(File::exists($expiredDump))->toBeFalse()
        ->and(File::exists($boundaryDump))->toBeTrue()
        ->and(File::exists($temporaryFile))->toBeTrue()
        ->and(File::exists($unrelatedFile))->toBeTrue()
        ->and(File::exists($this->dumpDirectory.DIRECTORY_SEPARATOR.'tracker-production-2026-07-14_143000.sql'))->toBeTrue();
});

test('an invalid retention value fails before pg dump is invoked', function () {
    config(['database-dumps.retention_days' => '-1']);
    Process::fake();

    $this->artisan('app:dump-database')
        ->expectsOutputToContain('DB_DUMP_RETENTION_DAYS must be a non-negative whole number')
        ->assertFailed();

    Process::assertNothingRan();
});

test('a non writable destination fails before pg dump is invoked', function () {
    $filesystem = mock(Filesystem::class);
    $filesystem->shouldReceive('exists')->once()->with($this->dumpDirectory)->andReturnTrue();
    $filesystem->shouldReceive('isDirectory')->times(3)->with($this->dumpDirectory)->andReturnTrue();
    $filesystem->shouldReceive('isWritable')->once()->with($this->dumpDirectory)->andReturnFalse();
    app()->instance(Filesystem::class, $filesystem);
    Process::fake();

    $this->artisan('app:dump-database')
        ->expectsOutputToContain("Database dump directory is not writable: {$this->dumpDirectory}")
        ->assertFailed();

    Process::assertNothingRan();
});

test('an active database dump lock prevents another process from starting', function () {
    $lock = Cache::lock('database-dumps:running', 60);
    expect($lock->get())->toBeTrue();
    Process::fake();

    try {
        $this->artisan('app:dump-database')
            ->expectsOutputToContain('Another database dump is already running')
            ->assertSuccessful();

        Process::assertNothingRan();
    } finally {
        $lock->release();
    }
});
