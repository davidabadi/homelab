<?php

namespace Tests\Feature\Settings;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Fortify\Features;
use Tests\TestCase;

class SecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_security_page_is_displayed()
    {
        $this->skipUnlessFortifyHas(Features::twoFactorAuthentication());

        Features::twoFactorAuthentication([
            'confirm' => true,
            'confirmPassword' => true,
        ]);
        Features::passkeys([
            'confirmPassword' => true,
        ]);

        $user = User::factory()->create();

        $this->actingAs($user)
            ->withSession(['auth.password_confirmed_at' => time()])
            ->get(route('security.edit'))
            ->assertInertia(fn (Assert $page) => $page
                ->component('settings/security')
                ->where('canManagePasskeys', true)
                ->where('passkeys', [])
                ->where('canManageTwoFactor', true)
                ->where('twoFactorEnabled', false),
            );
    }

    public function test_security_page_requires_password_confirmation_when_enabled()
    {
        $this->skipUnlessFortifyHas(Features::twoFactorAuthentication());

        $user = User::factory()->create();

        Features::twoFactorAuthentication([
            'confirm' => true,
            'confirmPassword' => true,
        ]);

        $response = $this->actingAs($user)
            ->get(route('security.edit'));

        $response->assertRedirect(route('password.confirm'));
    }

    public function test_password_confirmation_returns_to_the_native_security_page()
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get(route('security.edit'))
            ->assertRedirect(route('password.confirm'));

        $this->post(route('password.confirm.store'), [
            'password' => 'password',
        ])->assertRedirect(route('security.edit'));
    }

    public function test_guests_are_redirected_from_every_settings_page()
    {
        foreach (['profile.edit', 'security.edit', 'appearance.edit'] as $routeName) {
            $this->get(route($routeName))
                ->assertRedirect(route('login'));
        }
    }

    public function test_appearance_page_is_displayed_in_the_settings_experience()
    {
        $this->actingAs(User::factory()->create())
            ->get(route('appearance.edit'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('settings/appearance')
            );
    }

    public function test_security_routes_keep_password_confirmation_and_throttling()
    {
        $securityMiddleware = Route::getRoutes()
            ->getByName('security.edit')
            ?->gatherMiddleware();
        $passwordMiddleware = Route::getRoutes()
            ->getByName('user-password.update')
            ?->gatherMiddleware();

        $this->assertContains('Illuminate\\Auth\\Middleware\\RequirePassword', $securityMiddleware);
        $this->assertContains('throttle:6,1', $passwordMiddleware);
    }

    public function test_two_factor_and_passkey_management_routes_remain_reachable()
    {
        foreach ([
            'two-factor.enable',
            'two-factor.confirm',
            'two-factor.recovery-codes',
            'two-factor.regenerate-recovery-codes',
            'passkey.registration-options',
            'passkey.store',
            'passkey.destroy',
        ] as $routeName) {
            $route = Route::getRoutes()->getByName($routeName);

            $this->assertNotNull($route, "The {$routeName} route is missing.");
        }

        $this->assertContains(
            'password.confirm',
            Route::getRoutes()->getByName('two-factor.enable')?->gatherMiddleware(),
        );
        $this->assertContains(
            'password.confirm',
            Route::getRoutes()->getByName('passkey.store')?->gatherMiddleware(),
        );
    }

    public function test_well_known_passkey_endpoints_point_to_native_security_settings()
    {
        $this->get(route('well-known.passkeys'))
            ->assertOk()
            ->assertExactJson([
                'enroll' => route('security.edit'),
                'manage' => route('security.edit'),
            ]);
    }

    public function test_security_page_renders_without_two_factor_when_feature_is_disabled()
    {
        $this->skipUnlessFortifyHas(Features::twoFactorAuthentication());

        config(['fortify.features' => []]);

        $user = User::factory()->create();

        $this->actingAs($user)
            ->withSession(['auth.password_confirmed_at' => time()])
            ->get(route('security.edit'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('settings/security')
                ->where('canManagePasskeys', false)
                ->where('passkeys', [])
                ->where('canManageTwoFactor', false)
                ->missing('twoFactorEnabled')
                ->missing('requiresConfirmation'),
            );
    }

    public function test_password_can_be_updated()
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->from(route('security.edit'))
            ->put(route('user-password.update'), [
                'current_password' => 'password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('security.edit'));

        $this->assertTrue(Hash::check('new-password', $user->refresh()->password));
    }

    public function test_correct_password_must_be_provided_to_update_password()
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->from(route('security.edit'))
            ->put(route('user-password.update'), [
                'current_password' => 'wrong-password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ]);

        $response
            ->assertSessionHasErrors('current_password')
            ->assertRedirect(route('security.edit'));
    }
}
