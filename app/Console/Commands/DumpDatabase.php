<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Database\DatabaseManager;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Number;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

#[Signature('app:dump-database')]
#[Description('Create a plain-text PostgreSQL database dump')]
class DumpDatabase extends Command
{
    private const LOCK_NAME = 'database-dumps:running';

    private const LOCK_SECONDS = 43_200;

    private const PROCESS_TIMEOUT_SECONDS = 21_600;

    public function handle(DatabaseManager $databaseManager, Filesystem $filesystem): int
    {
        $lock = Cache::lock(self::LOCK_NAME, self::LOCK_SECONDS);

        if (! $lock->get()) {
            $this->warn('Another database dump is already running; no new dump was started.');

            return self::SUCCESS;
        }

        try {
            return $this->createDump($databaseManager, $filesystem);
        } finally {
            $lock->release();
        }
    }

    private function createDump(DatabaseManager $databaseManager, Filesystem $filesystem): int
    {
        $connection = $databaseManager->connection();
        $connectionName = $connection->getName();
        $connectionConfig = $connection->getConfig();

        if (($connectionConfig['driver'] ?? null) !== 'pgsql') {
            $this->error("Database connection [{$connectionName}] is not PostgreSQL. Configure DB_CONNECTION=pgsql before creating a dump.");

            return self::FAILURE;
        }

        $directory = rtrim((string) config('database-dumps.directory'), '/\\');

        if ($directory === '') {
            $this->error('The database dump directory is not configured.');

            return self::FAILURE;
        }

        if (! $this->prepareDirectory($filesystem, $directory)) {
            return self::FAILURE;
        }

        $retentionDays = $this->retentionDays();

        if ($retentionDays === null) {
            return self::FAILURE;
        }

        $databaseName = (string) ($connectionConfig['database'] ?? '');
        $filenameDatabase = Str::slug($databaseName) ?: 'database';
        $filename = $filenameDatabase.'-'.now()->format('Y-m-d_His').'.sql';
        $finalPath = $directory.DIRECTORY_SEPARATOR.$filename;
        $temporaryPath = $directory.DIRECTORY_SEPARATOR.'.'.$filename.'.'.Str::random(12).'.tmp';
        $password = (string) ($connectionConfig['password'] ?? '');

        if ($filesystem->exists($finalPath)) {
            $this->error("Refusing to overwrite an existing database dump: {$finalPath}");

            return self::FAILURE;
        }

        try {
            $result = Process::env($this->processEnvironment($connectionConfig, $password))
                ->timeout(self::PROCESS_TIMEOUT_SECONDS)
                ->run($this->processCommand($connectionConfig, $temporaryPath));

            if ($result->failed()) {
                $message = trim($result->errorOutput()) ?: 'pg_dump exited with code '.$result->exitCode().'.';
                $this->error('Database dump failed: '.$this->redactPassword($message, $password));

                return self::FAILURE;
            }

            if (! $filesystem->exists($temporaryPath) || $filesystem->size($temporaryPath) === 0) {
                $this->error('Database dump failed: pg_dump did not create a non-empty dump file.');

                return self::FAILURE;
            }

            if (! $filesystem->move($temporaryPath, $finalPath)) {
                $this->error("Database dump completed, but the temporary file could not be finalized at {$finalPath}.");

                return self::FAILURE;
            }

            try {
                $deletedDumpCount = $this->deleteExpiredDumps($filesystem, $directory, $retentionDays);
            } catch (Throwable $exception) {
                $this->error("Database dump completed at {$finalPath}, but expired dumps could not be removed: {$exception->getMessage()}");

                return self::FAILURE;
            }

            $this->info("Database dump completed: {$finalPath} (".Number::fileSize($filesystem->size($finalPath)).').');

            if ($deletedDumpCount > 0) {
                $this->info("Removed {$deletedDumpCount} expired database ".Str::plural('dump', $deletedDumpCount).'.');
            }

            return self::SUCCESS;
        } catch (ProcessTimedOutException) {
            $this->error('Database dump failed: pg_dump exceeded the six-hour timeout.');

            return self::FAILURE;
        } catch (Throwable $exception) {
            $this->error('Database dump failed: '.$this->redactPassword($exception->getMessage(), $password));

            return self::FAILURE;
        } finally {
            if ($filesystem->exists($temporaryPath)) {
                $filesystem->delete($temporaryPath);
            }
        }
    }

    private function prepareDirectory(Filesystem $filesystem, string $directory): bool
    {
        try {
            if ($filesystem->exists($directory) && ! $filesystem->isDirectory($directory)) {
                $this->error("Database dump destination is not a directory: {$directory}");

                return false;
            }

            if (! $filesystem->isDirectory($directory)) {
                $filesystem->makeDirectory($directory, 0755, true);
            }
        } catch (Throwable $exception) {
            $this->error("Unable to create database dump directory [{$directory}]: {$exception->getMessage()}");

            return false;
        }

        if (! $filesystem->isDirectory($directory)) {
            $this->error("Unable to create database dump directory: {$directory}");

            return false;
        }

        if (! $filesystem->isWritable($directory)) {
            $this->error("Database dump directory is not writable: {$directory}. Check the Unraid share and container bind-mount permissions.");

            return false;
        }

        return true;
    }

    private function retentionDays(): ?int
    {
        $retentionDays = config('database-dumps.retention_days');

        if (is_int($retentionDays) && $retentionDays >= 0) {
            return $retentionDays;
        }

        if (is_string($retentionDays) && ctype_digit($retentionDays)) {
            return (int) $retentionDays;
        }

        $this->error('DB_DUMP_RETENTION_DAYS must be a non-negative whole number.');

        return null;
    }

    private function deleteExpiredDumps(Filesystem $filesystem, string $directory, int $retentionDays): int
    {
        $cutoffTimestamp = now()->startOfDay()->subDays($retentionDays)->getTimestamp();
        $deletedDumpCount = 0;

        foreach ($filesystem->files($directory) as $file) {
            if ($file->getExtension() !== 'sql' || $file->getMTime() >= $cutoffTimestamp) {
                continue;
            }

            if (! $filesystem->delete($file->getPathname())) {
                throw new RuntimeException("Unable to delete expired database dump [{$file->getPathname()}]. Check the backup directory permissions.");
            }

            $deletedDumpCount++;
        }

        return $deletedDumpCount;
    }

    /**
     * @param  array<string, mixed>  $connectionConfig
     * @return list<string>
     */
    private function processCommand(array $connectionConfig, string $temporaryPath): array
    {
        return [
            'pg_dump',
            '--host',
            (string) ($connectionConfig['host'] ?? '127.0.0.1'),
            '--port',
            (string) ($connectionConfig['port'] ?? '5432'),
            '--username',
            (string) ($connectionConfig['username'] ?? ''),
            '--dbname',
            (string) ($connectionConfig['database'] ?? ''),
            '--format',
            'plain',
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-password',
            '--file',
            $temporaryPath,
        ];
    }

    /**
     * @param  array<string, mixed>  $connectionConfig
     * @return array<string, string>
     */
    private function processEnvironment(array $connectionConfig, string $password): array
    {
        $environment = ['PGPASSWORD' => $password];
        $sslMode = $connectionConfig['sslmode'] ?? null;

        if (is_string($sslMode) && $sslMode !== '') {
            $environment['PGSSLMODE'] = $sslMode;
        }

        return $environment;
    }

    private function redactPassword(string $message, string $password): string
    {
        return $password === '' ? $message : str_replace($password, '[REDACTED]', $message);
    }
}
