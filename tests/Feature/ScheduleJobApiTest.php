<?php

declare(strict_types=1);

use App\Models\ScheduleJob;
use App\Models\ScheduleResource;
use App\Models\User;

it('creates lists updates and deletes jobs with resource assignments', function () {
    $user = User::factory()->create();
    $resource = ScheduleResource::factory()->for($user)->create();

    $created = $this->actingAs($user)->postJson(route('schedule.jobs.store'), [
        'name' => 'Nightly backup',
        'start_time' => '23:30',
        'duration_minutes' => 120,
        'weekdays' => [2, 0],
        'resources' => [$resource->id],
        'notes' => 'Crosses midnight',
    ])->assertCreated()
        ->assertJsonPath('job.weekdays', [0, 2])
        ->assertJsonPath('job.resources.0', $resource->id);

    $job = ScheduleJob::query()->findOrFail($created->json('job.id'));
    expect($job->user_id)->toBe($user->id);

    $this->actingAs($user)->getJson(route('schedule.jobs.index'))
        ->assertOk()->assertJsonCount(1, 'jobs');

    $this->actingAs($user)->putJson(route('schedule.jobs.update', $job), [
        'name' => 'Short backup',
        'start_time' => '02:00',
        'duration_minutes' => 30,
        'weekdays' => [1],
        'resources' => [],
        'notes' => null,
    ])->assertOk()
        ->assertJsonPath('job.duration_minutes', 30)
        ->assertJsonPath('job.resources', []);

    $this->actingAs($user)->deleteJson(route('schedule.jobs.destroy', $job))->assertNoContent();
    $this->assertModelMissing($job);
});

it('validates time duration weekdays and rejects cross-user resource ids', function () {
    $user = User::factory()->create();
    $otherResource = ScheduleResource::factory()->for(User::factory())->create();

    $this->actingAs($user)->postJson(route('schedule.jobs.store'), [
        'name' => 'Invalid job',
        'start_time' => '25:00',
        'duration_minutes' => 10081,
        'weekdays' => [7],
        'resources' => [$otherResource->id],
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['start_time', 'duration_minutes', 'weekdays.0', 'resources.0']);

    expect(ScheduleJob::query()->doesntExist())->toBeTrue();
});

it('returns cross-midnight conflicts and union utilization from the board endpoint', function () {
    $user = User::factory()->create();
    $resource = ScheduleResource::factory()->for($user)->create();
    $monday = ScheduleJob::factory()->for($user)->onWeekdays([0])->create([
        'start_time' => '23:30',
        'duration_minutes' => 120,
    ]);
    $tuesday = ScheduleJob::factory()->for($user)->onWeekdays([1])->create([
        'start_time' => '00:30',
        'duration_minutes' => 30,
    ]);
    $monday->resources()->attach($resource);
    $tuesday->resources()->attach($resource);

    $this->actingAs($user)->getJson(route('schedule.board.show', ['weekday' => 1]))
        ->assertOk()
        ->assertJsonPath('resources.0.id', $resource->id)
        ->assertJsonPath('jobs.0.resources.0', $resource->id)
        ->assertJsonPath('conflicts.0.resource_id', $resource->id)
        ->assertJsonPath('conflicts.0.overlaps.0.weekday', 1)
        ->assertJsonPath('conflicts.0.overlaps.0.start_minute', 30)
        ->assertJsonPath('conflicts.0.overlaps.0.end_minute', 60)
        ->assertJsonPath('utilization.0.occupied_minutes', 90);
});
