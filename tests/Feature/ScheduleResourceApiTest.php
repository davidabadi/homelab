<?php

declare(strict_types=1);

use App\Models\ScheduleResource;
use App\Models\User;

it('requires authentication for schedule resource endpoints', function () {
    $this->getJson(route('schedule.resources.index'))->assertUnauthorized();
});

it('creates lists updates and deletes resources for the current user', function () {
    $user = User::factory()->create();

    $created = $this->actingAs($user)->postJson(route('schedule.resources.store'), [
        'label' => 'Unraid',
        'subtitle' => 'Primary storage',
    ])->assertCreated()->assertJsonPath('resource.label', 'Unraid');

    $resource = ScheduleResource::query()->findOrFail($created->json('resource.id'));
    expect($resource->user_id)->toBe($user->id);

    $this->actingAs($user)->getJson(route('schedule.resources.index'))
        ->assertOk()
        ->assertJsonCount(1, 'resources')
        ->assertJsonPath('resources.0.subtitle', 'Primary storage');

    $this->actingAs($user)->putJson(route('schedule.resources.update', $resource), [
        'label' => 'Unraid NAS',
        'subtitle' => null,
    ])->assertOk()->assertJsonPath('resource.label', 'Unraid NAS');

    $this->actingAs($user)->deleteJson(route('schedule.resources.destroy', $resource))->assertNoContent();
    $this->assertModelMissing($resource);
});

it('never lists or mutates another users resources', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();
    $resource = ScheduleResource::factory()->for($owner)->create();

    $this->actingAs($other)->getJson(route('schedule.resources.index'))
        ->assertOk()
        ->assertJsonCount(0, 'resources');
    $this->actingAs($other)->putJson(route('schedule.resources.update', $resource), [
        'label' => 'Stolen',
        'subtitle' => null,
    ])->assertNotFound();
    $this->actingAs($other)->deleteJson(route('schedule.resources.destroy', $resource))->assertNotFound();

    expect($resource->fresh()->label)->not->toBe('Stolen');
});
