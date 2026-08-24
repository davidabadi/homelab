<?php

declare(strict_types=1);

use App\Models\ScheduleJob;
use App\Models\ScheduleResource;
use App\Models\User;

function legacyScheduleBoard(array $overrides = []): array
{
    return [
        'version' => 3,
        'resources' => [
            ['id' => 'unraid', 'label' => 'Unraid', 'sub' => 'Primary storage'],
            ['id' => 's3', 'label' => 'S3 Bucket', 'sub' => 'Deep archive'],
        ],
        'jobs' => [
            [
                'id' => 'nightly',
                'name' => 'Nightly backup',
                'start' => '23:30',
                'dur' => 120,
                'days' => [0, 2, 4],
                'assigns' => ['unraid', 's3'],
                'notes' => 'Portable backup',
            ],
        ],
        ...$overrides,
    ];
}

it('imports version 3 JSON and preserves its portable schedule fields', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson(route('schedule.board.import'), legacyScheduleBoard())
        ->assertOk()
        ->assertJson([
            'imported' => true,
            'mode' => 'merge',
            'resource_count' => 2,
            'job_count' => 1,
        ]);

    expect($user->scheduleResources()->count())->toBe(2)
        ->and($user->scheduleJobs()->count())->toBe(1);

    $job = $user->scheduleJobs()->with('resources')->sole();
    expect($job->name)->toBe('Nightly backup')
        ->and(mb_substr($job->start_time, 0, 5))->toBe('23:30')
        ->and($job->duration_minutes)->toBe(120)
        ->and($job->weekdays)->toBe([0, 2, 4])
        ->and($job->resources->pluck('portable_id')->sort()->values()->all())->toBe(['s3', 'unraid'])
        ->and($job->notes)->toBe('Portable backup');
});

it('requires an explicit merge or replace choice for a non-empty board', function () {
    $user = User::factory()->create();
    ScheduleResource::factory()->for($user)->create(['portable_id' => 'existing']);

    $this->actingAs($user)->postJson(route('schedule.board.import'), legacyScheduleBoard())
        ->assertUnprocessable()
        ->assertJsonValidationErrors('mode');

    $this->actingAs($user)->postJson(route('schedule.board.import'), [
        ...legacyScheduleBoard(),
        'mode' => 'replace',
    ])->assertOk()->assertJsonPath('mode', 'replace');

    expect($user->scheduleResources()->where('portable_id', 'existing')->doesntExist())->toBeTrue()
        ->and($user->scheduleResources()->count())->toBe(2);
});

it('allows different imported jobs to use the same days and resources', function () {
    $user = User::factory()->create();
    $board = legacyScheduleBoard();
    $board['jobs'][] = [
        ...$board['jobs'][0],
        'id' => 'replication',
        'name' => 'Replication',
    ];

    $this->actingAs($user)->postJson(route('schedule.board.import'), $board)
        ->assertOk()
        ->assertJsonPath('job_count', 2);

    expect($user->scheduleJobs()->count())->toBe(2);
});

it('merges by portable ids while retaining records absent from the import', function () {
    $user = User::factory()->create();
    ScheduleResource::factory()->for($user)->create([
        'portable_id' => 'unraid',
        'label' => 'Old label',
    ]);
    ScheduleResource::factory()->for($user)->create([
        'portable_id' => 'retained',
        'label' => 'Retained resource',
    ]);

    $this->actingAs($user)->postJson(route('schedule.board.import'), [
        ...legacyScheduleBoard(),
        'mode' => 'merge',
    ])->assertOk();

    expect($user->scheduleResources()->where('portable_id', 'unraid')->sole()->label)->toBe('Unraid')
        ->and($user->scheduleResources()->where('portable_id', 'retained')->exists())->toBeTrue()
        ->and($user->scheduleResources()->count())->toBe(3);
});

it('rejects malformed imports without changing the existing board', function () {
    $user = User::factory()->create();
    $resource = ScheduleResource::factory()->for($user)->create(['portable_id' => 'existing']);
    $job = ScheduleJob::factory()->for($user)->create(['portable_id' => 'existing-job']);
    $job->resources()->attach($resource);

    $invalid = legacyScheduleBoard([
        'version' => 2,
        'mode' => 'replace',
        'jobs' => [[
            'id' => 'bad',
            'name' => 'Bad',
            'start' => 'not-a-time',
            'dur' => 0,
            'days' => [],
            'assigns' => ['missing'],
            'notes' => '',
        ]],
    ]);

    $this->actingAs($user)->postJson(route('schedule.board.import'), $invalid)
        ->assertUnprocessable()
        ->assertJsonValidationErrors([
            'version', 'jobs.0.start', 'jobs.0.dur', 'jobs.0.days', 'jobs.0.assigns.0',
        ]);

    expect($resource->fresh())->not->toBeNull()
        ->and($job->fresh())->not->toBeNull();
});

it('round trips a portable export into another users board', function () {
    $source = User::factory()->create();
    $target = User::factory()->create();
    $this->actingAs($source)->postJson(route('schedule.board.import'), legacyScheduleBoard())->assertOk();

    $exportResponse = $this->actingAs($source)->get(route('schedule.board.export'));
    $exportResponse->assertOk()->assertDownload('homelab-schedule.json');
    $exported = json_decode($exportResponse->streamedContent(), true, flags: JSON_THROW_ON_ERROR);

    $this->actingAs($target)->postJson(route('schedule.board.import'), $exported)->assertOk();
    $roundTripResponse = $this->actingAs($target)->get(route('schedule.board.export'));
    $roundTrip = json_decode($roundTripResponse->streamedContent(), true, flags: JSON_THROW_ON_ERROR);

    expect($roundTrip)->toBe($exported)
        ->and($target->scheduleResources()->count())->toBe(2)
        ->and($target->scheduleJobs()->count())->toBe(1);
});
