<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * How a watched-toggle tap changes a per-user watch count (episodes + movies).
 * Watched status is a count now, not a boolean, so a single "toggle" is no
 * longer enough — the UI needs to distinguish these three intents:
 *
 * - Increment: mark watched again (0 → 1 for a first watch, or a rewatch bump).
 * - SetOnce: collapse a multi-watch count back to exactly one watch.
 * - Reset: mark as not watched (count → 0).
 */
enum WatchAction: string
{
    case Increment = 'increment';
    case SetOnce = 'set_once';
    case Reset = 'reset';
}
