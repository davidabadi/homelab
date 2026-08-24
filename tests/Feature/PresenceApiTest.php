<?php

declare(strict_types=1);

use App\Enums\PresenceTripStatus;
use App\Models\PresencePlanningLimit;
use App\Models\PresenceTrip;
use App\Models\User;

it('requires authentication for presence data', function () {
    $this->getJson(route('presence.trips.index'))->assertUnauthorized();
});

it('creates date-only trips and returns only the authenticated users trips', function () {
    $user = User::factory()->create();
    $otherUser = User::factory()->create();
    PresenceTrip::factory()->for($otherUser)->create([
        'entry_date' => '2026-02-01',
        'exit_date' => '2026-02-02',
        'status' => PresenceTripStatus::Confirmed,
    ]);

    $response = $this->actingAs($user)->postJson(route('presence.trips.store'), [
        'entry_date' => '2026-04-10',
        'exit_date' => '2026-04-10',
        'status' => 'confirmed',
        'notes' => 'Synthetic same-day trip',
    ]);

    $response->assertCreated()
        ->assertJsonPath('trip.entry_date', '2026-04-10')
        ->assertJsonPath('trip.exit_date', '2026-04-10')
        ->assertJsonPath('trip.status', 'confirmed');

    $this->actingAs($user)->getJson(route('presence.trips.index'))
        ->assertOk()
        ->assertJsonCount(1, 'trips')
        ->assertJsonPath('trips.0.notes', 'Synthetic same-day trip');
});

it('rejects invalid date order and overlapping confirmed trips', function () {
    $user = User::factory()->create();
    PresenceTrip::factory()->for($user)->create([
        'entry_date' => '2026-05-01',
        'exit_date' => '2026-05-10',
        'status' => PresenceTripStatus::Confirmed,
    ]);

    $this->actingAs($user)->postJson(route('presence.trips.store'), [
        'entry_date' => '2026-05-08',
        'exit_date' => '2026-05-12',
        'status' => 'confirmed',
    ])->assertUnprocessable()->assertJsonValidationErrors('entry_date');

    $this->actingAs($user)->postJson(route('presence.trips.store'), [
        'entry_date' => '2026-06-02',
        'exit_date' => '2026-06-01',
        'status' => 'confirmed',
    ])->assertUnprocessable()->assertJsonValidationErrors('exit_date');
});

it('allows planned overlap but unions it in the summary', function () {
    $user = User::factory()->create();
    PresenceTrip::factory()->for($user)->create([
        'entry_date' => '2026-05-01',
        'exit_date' => '2026-05-10',
        'status' => PresenceTripStatus::Confirmed,
    ]);

    $this->actingAs($user)->postJson(route('presence.trips.store'), [
        'entry_date' => '2026-05-05',
        'exit_date' => '2026-05-15',
        'status' => 'planned',
    ])->assertCreated();

    $this->actingAs($user)->getJson(route('presence.summary', [
        'year' => 2026,
        'as_of' => '2026-12-31',
    ]))->assertOk()
        ->assertJsonPath('confirmed_scheduled_days', 10)
        ->assertJsonPath('planned_days', 11)
        ->assertJsonPath('projected_total', 15);
});

it('does not expose another users trip by identifier', function () {
    $trip = PresenceTrip::factory()->create();

    $this->actingAs(User::factory()->create())
        ->getJson(route('presence.trips.show', $trip))
        ->assertNotFound();
});

it('stores a default planning limit with per-year overrides', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->putJson(route('presence.planning.default.update'), [
        'default_planning_limit' => 178,
    ])->assertOk()->assertJsonPath('default_planning_limit', 178);

    $this->actingAs($user)->putJson(route('presence.planning.year.update', 2026), [
        'planning_limit' => 180,
    ])->assertOk()
        ->assertJsonPath('yearly_overrides.0.year', 2026)
        ->assertJsonPath('yearly_overrides.0.planning_limit', 180);

    expect(PresencePlanningLimit::whereBelongsTo($user)->where('year', 2026)->value('planning_limit'))
        ->toBe(180);
});

it('uses the annual override in summaries and keeps planning data user scoped', function () {
    $user = User::factory()->create();
    $otherUser = User::factory()->create();
    $user->presencePlanningSetting()->create(['default_planning_limit' => 178]);
    $user->presencePlanningLimits()->create(['year' => 2026, 'planning_limit' => 180]);
    $otherUser->presencePlanningLimits()->create(['year' => 2027, 'planning_limit' => 999]);
    PresenceTrip::factory()->for($user)->create([
        'entry_date' => '2026-01-01',
        'exit_date' => '2026-01-10',
        'status' => PresenceTripStatus::Confirmed,
    ]);

    $this->actingAs($user)->getJson(route('presence.summary', [
        'year' => 2026,
        'as_of' => '2026-12-31',
        'basis' => 'projected',
    ]))->assertOk()
        ->assertJsonPath('planning_limit', 180)
        ->assertJsonPath('planning_basis', 'projected')
        ->assertJsonPath('selected_calculated_total', 10)
        ->assertJsonPath('remaining_against_planning_limit', 170)
        ->assertJsonPath('legacy_weighted_total', 10)
        ->assertJsonPath('spt_current_year_days', 10)
        ->assertJsonPath('spt_weighted_total_sixths', 60)
        ->assertJsonPath('spt_weighted_total', '10')
        ->assertJsonPath('spt_meets_31_day_requirement', false)
        ->assertJsonPath('spt_meets_183_day_requirement', false)
        ->assertJsonPath('spt_met', false)
        ->assertJsonPath('available_years', [2026]);

    $this->actingAs($user)->getJson(route('presence.planning.show'))
        ->assertOk()
        ->assertJsonCount(1, 'yearly_overrides');
});
