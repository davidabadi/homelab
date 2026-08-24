<?php

declare(strict_types=1);

use App\Models\ScheduleJob;
use App\Models\ScheduleResource;
use App\Services\Schedule\ScheduleCalculator;
use Illuminate\Database\Eloquent\Collection;

function calculationResource(int $id): ScheduleResource
{
    $resource = new ScheduleResource(['label' => "Resource {$id}", 'portable_id' => "resource-{$id}"]);
    $resource->id = $id;

    return $resource;
}

/** @param list<int> $weekdays */
function calculationJob(
    int $id,
    string $start,
    int $duration,
    array $weekdays,
    ScheduleResource $resource,
): ScheduleJob {
    $job = new ScheduleJob([
        'portable_id' => "job-{$id}",
        'name' => "Job {$id}",
        'start_time' => $start,
        'duration_minutes' => $duration,
        'weekdays' => $weekdays,
    ]);
    $job->id = $id;
    $job->setRelation('resources', new Collection([$resource]));

    return $job;
}

it('detects ordinary overlaps on a shared resource and weekday', function () {
    $resource = calculationResource(1);
    $jobs = new Collection([
        calculationJob(1, '10:00', 60, [0], $resource),
        calculationJob(2, '10:30', 60, [0], $resource),
    ]);

    $conflicts = (new ScheduleCalculator)->conflicts($jobs);

    expect($conflicts)->toHaveCount(1)
        ->and($conflicts[0]['overlaps'])->toBe([
            ['weekday' => 0, 'start_minute' => 630, 'end_minute' => 660],
        ]);
});

it('detects conflicts carried across midnight into the next actual weekday', function () {
    $resource = calculationResource(1);
    $jobs = new Collection([
        calculationJob(1, '23:30', 120, [0], $resource),
        calculationJob(2, '00:30', 30, [1], $resource),
    ]);

    $conflicts = (new ScheduleCalculator)->conflicts($jobs);

    expect($conflicts)->toHaveCount(1)
        ->and($conflicts[0]['overlaps'])->toBe([
            ['weekday' => 1, 'start_minute' => 30, 'end_minute' => 60],
        ]);
});

it('does not conflict across different weekdays or resources', function () {
    $firstResource = calculationResource(1);
    $secondResource = calculationResource(2);
    $calculator = new ScheduleCalculator;

    expect($calculator->conflicts(new Collection([
        calculationJob(1, '10:00', 60, [0], $firstResource),
        calculationJob(2, '10:00', 60, [1], $firstResource),
    ])))->toBe([])
        ->and($calculator->conflicts(new Collection([
            calculationJob(3, '10:00', 60, [0], $firstResource),
            calculationJob(4, '10:00', 60, [0], $secondResource),
        ])))->toBe([]);
});

it('uses interval unions for selected-day and busiest-day utilization', function () {
    $resource = calculationResource(1);
    $jobs = new Collection([
        calculationJob(1, '01:00', 60, [0], $resource),
        calculationJob(2, '01:30', 60, [0], $resource),
        calculationJob(3, '23:30', 120, [0], $resource),
    ]);
    $calculator = new ScheduleCalculator;

    $monday = $calculator->utilization($jobs, new Collection([$resource]), 0)[0];
    $tuesday = $calculator->utilization($jobs, new Collection([$resource]), 1)[0];
    $all = $calculator->utilization($jobs, new Collection([$resource]), 'all')[0];

    expect($monday['occupied_minutes'])->toBe(120)
        ->and($tuesday['occupied_minutes'])->toBe(90)
        ->and($all['occupied_minutes'])->toBe(120)
        ->and($all['busiest_weekday'])->toBe(0);
});
