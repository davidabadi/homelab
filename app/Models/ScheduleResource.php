<?php

namespace App\Models;

use Database\Factories\ScheduleResourceFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * @property int $id
 * @property int $user_id
 * @property string $portable_id
 * @property string $label
 * @property string|null $subtitle
 */
class ScheduleResource extends Model
{
    /** @use HasFactory<ScheduleResourceFactory> */
    use HasFactory;

    protected $fillable = ['user_id', 'portable_id', 'label', 'subtitle'];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsToMany<ScheduleJob, $this> */
    public function jobs(): BelongsToMany
    {
        return $this->belongsToMany(ScheduleJob::class);
    }
}
