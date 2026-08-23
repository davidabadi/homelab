<?php

use App\Console\DatabaseDumpSchedule;
use Illuminate\Console\Scheduling\Schedule;
use Tests\TestCase;

uses(TestCase::class);

test('database dumps use the configured cron expression and prevent overlap', function () {
    config([
        'database-dumps.enabled' => true,
        'database-dumps.cron' => '15 4 * * 1-5',
    ]);
    $schedule = new Schedule;

    app(DatabaseDumpSchedule::class)->register($schedule);

    $event = $schedule->events()[0];

    expect($event->command)->toContain('app:dump-database')
        ->and($event->expression)->toBe('15 4 * * 1-5')
        ->and($event->withoutOverlapping)->toBeTrue()
        ->and($event->output)->toBe('/dev/stdout');
});

test('database dump schedule is not registered when disabled', function () {
    config(['database-dumps.enabled' => false]);
    $schedule = new Schedule;

    app(DatabaseDumpSchedule::class)->register($schedule);

    expect($schedule->events())->toBe([]);
});

test('invalid database dump cron expressions are rejected with a useful error', function () {
    config([
        'database-dumps.enabled' => true,
        'database-dumps.cron' => 'not a cron expression',
    ]);

    expect(fn () => app(DatabaseDumpSchedule::class)->register(new Schedule))
        ->toThrow(InvalidArgumentException::class, 'DB_DUMP_CRON must be a valid standard five-part cron expression');
});

test('the existing nightly tmdb refresh schedule remains unchanged', function () {
    $event = collect(app(Schedule::class)->events())
        ->first(fn ($event): bool => str_contains((string) $event->command, 'tmdb:refresh'));

    expect($event)->not->toBeNull()
        ->and($event->expression)->toBe('0 3 * * *')
        ->and($event->withoutOverlapping)->toBeTrue();
});
