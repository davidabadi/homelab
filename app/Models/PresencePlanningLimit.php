<?php

namespace App\Models;

use Database\Factories\PresencePlanningLimitFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property int $year
 * @property int $planning_limit
 */
class PresencePlanningLimit extends Model
{
    /** @use HasFactory<PresencePlanningLimitFactory> */
    use HasFactory;

    protected $fillable = ['user_id', 'year', 'planning_limit'];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
