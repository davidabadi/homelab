<?php

declare(strict_types=1);

use App\Models\ScheduleJob;
use App\Models\ScheduleResource;
use App\Models\User;

it('isolates job CRUD and board calculations by authenticated user', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();
    $resource = ScheduleResource::factory()->for($owner)->create();
    $job = ScheduleJob::factory()->for($owner)->create([
        'name' => 'Private backup',
        'weekdays' => [0],
    ]);
    $job->resources()->attach($resource);

    $this->actingAs($other)->getJson(route('schedule.jobs.index'))
        ->assertOk()->assertJsonCount(0, 'jobs');
    $this->actingAs($other)->getJson(route('schedule.board.show'))
        ->assertOk()
        ->assertJsonCount(0, 'resources')
        ->assertJsonCount(0, 'jobs')
        ->assertJsonCount(0, 'conflicts');

    $this->actingAs($other)->putJson(route('schedule.jobs.update', $job), [
        'name' => 'Changed',
        'start_time' => '01:00',
        'duration_minutes' => 30,
        'weekdays' => [1],
        'resources' => [],
    ])->assertNotFound();
    $this->actingAs($other)->deleteJson(route('schedule.jobs.destroy', $job))->assertNotFound();

    expect($job->fresh()->name)->toBe('Private backup');
});
