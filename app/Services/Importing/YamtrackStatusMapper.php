<?php

declare(strict_types=1);

namespace App\Services\Importing;

use App\Enums\ShowStatus;

final class YamtrackStatusMapper
{
    public function map(?string $status): ?ShowStatus
    {
        return match ($status) {
            'in progress' => ShowStatus::Watching,
            'planning' => ShowStatus::WatchLater,
            'paused', 'dropped' => ShowStatus::Stopped,
            default => null,
        };
    }

    public function isCompleted(?string $status): bool
    {
        return $status === 'completed';
    }
}
