<?php

namespace App\Models;

use Database\Factories\PresencePlanningSettingFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property int|null $default_planning_limit
 */
class PresencePlanningSetting extends Model
{
    /** @use HasFactory<PresencePlanningSettingFactory> */
    use HasFactory;

    protected $fillable = ['user_id', 'default_planning_limit'];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
