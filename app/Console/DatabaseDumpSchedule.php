<?php

declare(strict_types=1);

namespace App\Console;

use Cron\CronExpression;
use Illuminate\Console\Scheduling\Schedule;
use InvalidArgumentException;

class DatabaseDumpSchedule
{
    public function register(Schedule $schedule): void
    {
        if (! config('database-dumps.enabled')) {
            return;
        }

        $cron = config('database-dumps.cron');

        if (! is_string($cron) || count(preg_split('/\\s+/', trim($cron)) ?: []) !== 5 || ! CronExpression::isValidExpression($cron)) {
            $value = is_scalar($cron) ? (string) $cron : get_debug_type($cron);

            throw new InvalidArgumentException(
                "Invalid database dump cron expression [{$value}]. DB_DUMP_CRON must be a valid standard five-part cron expression.",
            );
        }

        $schedule->command('app:dump-database')
            ->cron($cron)
            ->withoutOverlapping()
            ->appendOutputTo('/dev/stdout');
    }
}
