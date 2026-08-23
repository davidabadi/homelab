<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Carbon\CarbonImmutable;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Laravel\Fortify\Contracts\PasskeyUser;
use Laravel\Fortify\PasskeyAuthenticatable;
use Laravel\Fortify\TwoFactorAuthenticatable;

/**
 * @property int $id
 * @property string $name
 * @property string $email
 * @property string|null $timezone
 * @property Carbon|null $email_verified_at
 * @property string $password
 * @property string|null $two_factor_secret
 * @property string|null $two_factor_recovery_codes
 * @property Carbon|null $two_factor_confirmed_at
 * @property string|null $remember_token
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable(['name', 'email', 'password', 'timezone'])]
#[Hidden(['password', 'two_factor_secret', 'two_factor_recovery_codes', 'remember_token'])]
class User extends Authenticatable implements PasskeyUser
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, PasskeyAuthenticatable, TwoFactorAuthenticatable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'two_factor_confirmed_at' => 'datetime',
        ];
    }

    /**
     * The timezone to reason about this user's calendar in — their own detected
     * timezone, falling back to the app timezone (UTC) until one is detected.
     */
    public function effectiveTimezone(): string
    {
        return $this->timezone ?? config('app.timezone');
    }

    /**
     * This user's current calendar date, expressed at UTC midnight.
     *
     * air_date / release_date are stored as timezone-less dates, so "today" is
     * pinned to UTC midnight of the user's local date to compare cleanly against
     * them and to yield whole-day differences. Without this, an evening in the US
     * (already past midnight UTC) rolls the calendar forward a day and tomorrow's
     * episodes read as "Today".
     */
    public function localToday(): CarbonImmutable
    {
        return CarbonImmutable::parse(
            now($this->effectiveTimezone())->toDateString()
        );
    }

    /**
     * This user's show list membership + status rows. Every tracking read/write
     * goes through here so it is inherently scoped to the user (spec §1 privacy).
     *
     * @return HasMany<UserShowTracking, $this>
     */
    public function showTrackings(): HasMany
    {
        return $this->hasMany(UserShowTracking::class);
    }

    /**
     * This user's movie watched-state rows. Scoped to the user, like shows.
     *
     * @return HasMany<UserMovieTracking, $this>
     */
    public function movieTrackings(): HasMany
    {
        return $this->hasMany(UserMovieTracking::class);
    }

    /**
     * This user's per-episode watched-state rows. Scoped to the user, like the
     * others — episode toggles resolve through here so one member can never read
     * or flip another's watch data (spec §1 privacy, build-order item 6).
     *
     * @return HasMany<UserEpisodeWatch, $this>
     */
    public function episodeWatches(): HasMany
    {
        return $this->hasMany(UserEpisodeWatch::class);
    }

    /** @return HasMany<YamtrackImport, $this> */
    public function yamtrackImports(): HasMany
    {
        return $this->hasMany(YamtrackImport::class);
    }
}
