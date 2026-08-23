<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ShowStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-user show list membership + status (spec §4). Fully private per user —
 * every read/write is scoped to a single user_id, never crossing household
 * members.
 *
 * @property int $id
 * @property int $user_id
 * @property int $show_id
 * @property ShowStatus $status
 */
class UserShowTracking extends Model
{
    // Migration table is singular; Eloquent would otherwise guess a plural.
    protected $table = 'user_show_tracking';

    protected $fillable = ['user_id', 'show_id', 'status'];

    protected function casts(): array
    {
        return [
            'status' => ShowStatus::class,
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Show, $this>
     */
    public function show(): BelongsTo
    {
        return $this->belongsTo(Show::class);
    }
}
