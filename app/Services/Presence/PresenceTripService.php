<?php

namespace App\Services\Presence;

use App\Enums\PresenceTripStatus;
use App\Models\PresenceTrip;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PresenceTripService
{
    /** @param array{entry_date: string, exit_date: string, status: string, notes?: string|null} $attributes */
    public function create(User $user, array $attributes): PresenceTrip
    {
        return DB::transaction(function () use ($user, $attributes): PresenceTrip {
            $lockedUser = User::query()->whereKey($user)->lockForUpdate()->firstOrFail();

            $this->ensureConfirmedTripDoesNotOverlap($lockedUser, $attributes);

            return $lockedUser->presenceTrips()->create($attributes);
        });
    }

    /** @param array{entry_date: string, exit_date: string, status: string, notes?: string|null} $attributes */
    public function update(User $user, PresenceTrip $trip, array $attributes): PresenceTrip
    {
        return DB::transaction(function () use ($user, $trip, $attributes): PresenceTrip {
            $lockedUser = User::query()->whereKey($user)->lockForUpdate()->firstOrFail();
            $lockedTrip = $lockedUser->presenceTrips()->whereKey($trip)->lockForUpdate()->firstOrFail();

            $this->ensureConfirmedTripDoesNotOverlap($lockedUser, $attributes, $lockedTrip->id);
            $lockedTrip->update($attributes);

            return $lockedTrip->refresh();
        });
    }

    /** @param array{entry_date: string, exit_date: string, status: string, notes?: string|null} $attributes */
    private function ensureConfirmedTripDoesNotOverlap(User $user, array $attributes, ?int $exceptTripId = null): void
    {
        if (PresenceTripStatus::from($attributes['status']) !== PresenceTripStatus::Confirmed) {
            return;
        }

        $overlapExists = $user->presenceTrips()
            ->where('status', PresenceTripStatus::Confirmed->value)
            ->overlapping($attributes['entry_date'], $attributes['exit_date'])
            ->when($exceptTripId !== null, fn ($query) => $query->whereKeyNot($exceptTripId))
            ->exists();

        if ($overlapExists) {
            throw ValidationException::withMessages([
                'entry_date' => 'This confirmed trip overlaps another confirmed trip on at least one calendar day.',
            ]);
        }
    }
}
