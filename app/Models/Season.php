<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Shared season metadata (spec §4). episode_count is cached from TMDB.
 *
 * @property int $id
 * @property int $show_id
 * @property int $season_number
 * @property int $episode_count
 */
class Season extends Model
{
    protected $fillable = ['show_id', 'season_number', 'episode_count'];

    protected function casts(): array
    {
        return [
            'season_number' => 'integer',
            'episode_count' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<Show, $this>
     */
    public function show(): BelongsTo
    {
        return $this->belongsTo(Show::class);
    }
}
