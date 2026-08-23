<?php

use App\Models\User;
use Illuminate\Support\Facades\Hash;

it('sets a new password for an existing user', function () {
    $user = User::factory()->create();

    $this->artisan('app:set-user-password', [
        '--email' => $user->email,
        '--password' => 'new-password',
    ])->assertSuccessful();

    expect(Hash::check('new-password', $user->fresh()->password))->toBeTrue();
});

it('prompts securely for omitted input', function () {
    $user = User::factory()->create();

    $this->artisan('app:set-user-password')
        ->expectsQuestion('Email', $user->email)
        ->expectsQuestion('New password', 'prompted-password')
        ->assertSuccessful();

    expect(Hash::check('prompted-password', $user->fresh()->password))->toBeTrue();
});

it('fails when the user does not exist', function () {
    $this->artisan('app:set-user-password', [
        '--email' => 'missing@example.com',
        '--password' => 'new-password',
    ])
        ->expectsOutput('No user was found with the email address missing@example.com.')
        ->assertFailed();
});

it('rejects an invalid password without changing the user', function () {
    $user = User::factory()->create();
    $originalPassword = $user->password;

    $this->artisan('app:set-user-password', [
        '--email' => $user->email,
        '--password' => 'short',
    ])->assertFailed();

    expect($user->fresh()->password)->toBe($originalPassword);
});
