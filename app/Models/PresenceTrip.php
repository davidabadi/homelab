<?php

namespace App\Models;

use App\Enums\PresenceTripStatus;
use Carbon\CarbonImmutable;
use Database\Factories\PresenceTripFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property CarbonImmutable $entry_date
 * @property CarbonImmutable $exit_date
 * @property PresenceTripStatus $status
 * @property string|null $notes
 */
class PresenceTrip extends Model
{
    /** @use HasFactory<PresenceTripFactory> */
    use HasFactory;

    protected $fillable = ['user_id', 'entry_date', 'exit_date', 'status', 'notes'];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @param  Builder<PresenceTrip>  $query
     * @return Builder<PresenceTrip>
     */
    public function scopeOverlapping(Builder $query, string $entryDate, string $exitDate): Builder
    {
        return $query->whereDate('entry_date', '<=', $exitDate)
            ->whereDate('exit_date', '>=', $entryDate);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'entry_date' => 'immutable_date',
            'exit_date' => 'immutable_date',
            'status' => PresenceTripStatus::class,
        ];
    }
}
