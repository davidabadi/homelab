<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * A user's tracking status for a show (spec §4, UserShowTracking). Matches the
 * string values stored in the user_show_tracking.status column.
 *
 * Watching is the status assigned whenever a show is tracked.
 */
enum ShowStatus: string
{
    case Watching = 'watching';
    case WatchLater = 'watch_later';
    case Finished = 'finished';
    case Stopped = 'stopped';
}
