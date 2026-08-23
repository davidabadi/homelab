<?php

declare(strict_types=1);

namespace App\Models;

use App\Concerns\TracksWatchCount;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-user movie watched state (spec §4). Fully private per user.
 *
 * Watched state is a count now (rewatches allowed): `watch_count` is the source
 * of truth, `watched` is the derived flag (watch_count > 0), and watched_date
 * reflects the most recent watch — auto-stamped on watch, cleared on reset, and
 * editable afterwards (spec §4/§9).
 *
 * @property int $id
 * @property int $user_id
 * @property int $movie_id
 * @property bool $watched
 * @property int $watch_count
 * @property CarbonImmutable|null $watched_date
 */
class UserMovieTracking extends Model
{
    use TracksWatchCount;

    // Migration table is singular; Eloquent would otherwise guess a plural.
    protected $table = 'user_movie_tracking';

    protected $fillable = ['user_id', 'movie_id', 'watched', 'watch_count', 'watched_date'];

    // Mirror the DB defaults so a freshly created row (e.g. via firstOrCreate,
    // which doesn't round-trip DB defaults) reports watched=false / count 0.
    protected $attributes = ['watched' => false, 'watch_count' => 0];

    protected function casts(): array
    {
        return [
            'watched' => 'boolean',
            'watch_count' => 'integer',
            'watched_date' => 'datetime',
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
     * @return BelongsTo<Movie, $this>
     */
    public function movie(): BelongsTo
    {
        return $this->belongsTo(Movie::class);
    }
}
