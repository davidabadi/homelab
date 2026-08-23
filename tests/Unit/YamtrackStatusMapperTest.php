<?php

declare(strict_types=1);

use App\Enums\ShowStatus;
use App\Services\Importing\YamtrackStatusMapper;

it('maps Yamtrack statuses conservatively', function (?string $status, ?ShowStatus $expected) {
    expect((new YamtrackStatusMapper)->map($status))->toBe($expected);
})->with([
    ['in progress', ShowStatus::Watching],
    ['planning', ShowStatus::WatchLater],
    ['paused', ShowStatus::Stopped],
    ['dropped', ShowStatus::Stopped],
    ['completed', null],
    [null, null],
]);
