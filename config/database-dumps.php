<?php

declare(strict_types=1);

return [
    'enabled' => env('DB_DUMP_ENABLED', true),
    'cron' => env('DB_DUMP_CRON', '0 2 * * *'),
    'retention_days' => env('DB_DUMP_RETENTION_DAYS', 7),
    'directory' => '/backups/database',
];
