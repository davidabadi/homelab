<?php

declare(strict_types=1);

use App\Models\User;

it('persists a valid browser-detected timezone for the user', function () {
    $user = User::factory()->create(['timezone' => null]);

    $this->actingAs($user)
        ->from(route('shows'))
        ->patch(route('timezone.update'), ['timezone' => 'America/New_York'])
        ->assertRedirect(route('shows'));

    expect($user->refresh()->timezone)->toBe('America/New_York');
});

it('rejects a value that is not a real IANA timezone', function () {
    $user = User::factory()->create(['timezone' => 'America/New_York']);

    $this->actingAs($user)
        ->from(route('shows'))
        ->patch(route('timezone.update'), ['timezone' => 'Mars/Olympus_Mons'])
        ->assertSessionHasErrors('timezone');

    // The bad value never reaches the record.
    expect($user->refresh()->timezone)->toBe('America/New_York');
});

it('requires a timezone', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->from(route('shows'))
        ->patch(route('timezone.update'), [])
        ->assertSessionHasErrors('timezone');
});

it('redirects guests away from the timezone endpoint', function () {
    $this->patch(route('timezone.update'), ['timezone' => 'America/New_York'])
        ->assertRedirect(route('login'));
});
