<?php

namespace App\Models;

use Database\Factories\ScheduleJobFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * @property int $id
 * @property int $user_id
 * @property string $portable_id
 * @property string $name
 * @property string $start_time
 * @property int $duration_minutes
 * @property list<int> $weekdays
 * @property string|null $notes
 */
class ScheduleJob extends Model
{
    /** @use HasFactory<ScheduleJobFactory> */
    use HasFactory;

    protected $fillable = [
        'user_id', 'portable_id', 'name', 'start_time', 'duration_minutes',
        'weekdays', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'duration_minutes' => 'integer',
            'weekdays' => 'array',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsToMany<ScheduleResource, $this> */
    public function resources(): BelongsToMany
    {
        return $this->belongsToMany(ScheduleResource::class);
    }
}
