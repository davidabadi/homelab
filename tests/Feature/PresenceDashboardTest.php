<?php

declare(strict_types=1);

use App\Enums\PresenceTripStatus;
use App\Models\PresenceTrip;
use App\Models\User;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;

it('renders the selected year with summaries components and only touching trips', function () {
    Carbon::setTestNow('2026-08-24 12:00:00');
    $user = User::factory()->create(['timezone' => 'UTC']);
    $otherUser = User::factory()->create();
    $user->presencePlanningSetting()->create(['default_planning_limit' => 30]);

    foreach ([
        ['2024-01-01', '2024-01-06', PresenceTripStatus::Confirmed],
        ['2025-01-01', '2025-01-09', PresenceTripStatus::Confirmed],
        ['2026-01-01', '2026-01-10', PresenceTripStatus::Confirmed],
        ['2026-10-01', '2026-10-05', PresenceTripStatus::Planned],
    ] as [$entryDate, $exitDate, $status]) {
        PresenceTrip::factory()->for($user)->create([
            'entry_date' => $entryDate,
            'exit_date' => $exitDate,
            'status' => $status,
        ]);
    }
    PresenceTrip::factory()->for($otherUser)->create([
        'entry_date' => '2026-01-01',
        'exit_date' => '2026-12-31',
    ]);

    $this->actingAs($user)
        ->get('http://presence.test/?year=2026')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('presence/index')
            ->where('selectedYear', 2026)
            ->where('summary.confirmed_days_elapsed', 10)
            ->where('summary.planned_days', 5)
            ->where('summary.projected_total', 15)
            ->where('summary.legacy_weighted_total', 19)
            ->where('summary.remaining_against_planning_limit', 11)
            ->has('weightedComponents', 3)
            ->where('weightedComponents.1.days', 9)
            ->where('weightedComponents.1.weighted_days', 3)
            ->has('trips', 2)
            ->where('trips.0.contribution_days', 10)
            ->where('trips.1.phase', 'planned')
            ->where('currentStatus.inside', false));
});

it('keeps a cross-year stay as one trip and reports its contribution per year', function () {
    $user = User::factory()->create(['timezone' => 'UTC']);
    $trip = PresenceTrip::factory()->for($user)->create([
        'entry_date' => '2026-12-29',
        'exit_date' => '2027-01-04',
        'status' => PresenceTripStatus::Confirmed,
    ]);

    $this->actingAs($user)
        ->get('http://presence.test/?year=2026')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('trips', 1)
            ->where('trips.0.id', $trip->id)
            ->where('trips.0.contribution_days', 3));

    $this->actingAs($user)
        ->get('http://presence.test/?year=2027')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('trips', 1)
            ->where('trips.0.id', $trip->id)
            ->where('trips.0.contribution_days', 4));

    expect($user->presenceTrips()->count())->toBe(1);
});

it('does not create records when an empty future year is viewed', function () {
    Carbon::setTestNow('2026-08-24 12:00:00');
    $user = User::factory()->create(['timezone' => 'UTC']);

    $this->actingAs($user)
        ->get('http://presence.test/?year=2032')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('selectedYear', 2032)
            ->where('availableYears', range(2026, 2032))
            ->has('trips', 0)
            ->where('summary.projected_total', 0));

    expect($user->presenceTrips()->doesntExist())->toBeTrue()
        ->and($user->presencePlanningLimits()->doesntExist())->toBeTrue();
});

it('marks only a confirmed current trip as current presence', function () {
    Carbon::setTestNow('2026-08-24 12:00:00');
    $user = User::factory()->create(['timezone' => 'UTC']);
    PresenceTrip::factory()->for($user)->create([
        'entry_date' => '2026-08-20',
        'exit_date' => '2026-08-30',
        'status' => PresenceTripStatus::Confirmed,
    ]);
    PresenceTrip::factory()->for($user)->create([
        'entry_date' => '2026-08-22',
        'exit_date' => '2026-08-28',
        'status' => PresenceTripStatus::Planned,
    ]);

    $this->actingAs($user)
        ->get('http://presence.test/')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('currentStatus.inside', true)
            ->where('currentStatus.day', 5));
});
