<?php

declare(strict_types=1);

namespace App\Enums;

enum YamtrackImportStatus: string
{
    case Pending = 'pending';
    case Processing = 'processing';
    case Completed = 'completed';
    case CompletedWithErrors = 'completed_with_errors';
    case Failed = 'failed';

    public function isActive(): bool
    {
        return in_array($this, [self::Pending, self::Processing], true);
    }
}
