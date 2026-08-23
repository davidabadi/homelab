<?php

use App\Console\DatabaseDumpSchedule;
use Illuminate\Console\Scheduling\Schedule as Scheduler;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Nightly TMDB refresh (spec §6): fan out one queued job per tracked show and
// per tracked movie missing confirmed metadata. The `scheduler` container runs
// `schedule:work`; the queued jobs are drained by the `queue` container.
// withoutOverlapping guards against a slow run still finishing when the next
// night's tick fires.
Schedule::command('tmdb:refresh')
    ->dailyAt('03:00')
    ->withoutOverlapping();

app(DatabaseDumpSchedule::class)->register(app(Scheduler::class));
