<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\EpisodeFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Shared episode metadata (spec §4). air_date drives the "Upcoming" query.
 *
 * @property int $id
 * @property int $show_id
 * @property int $season_number
 * @property int $episode_number
 * @property string|null $title
 * @property string|null $still_image_url
 * @property string|null $overview
 * @property CarbonImmutable|null $air_date
 * @property int|null $runtime_minutes
 */
class Episode extends Model
{
    /** @use HasFactory<EpisodeFactory> */
    use HasFactory;

    protected $fillable = [
        'show_id',
        'season_number',
        'episode_number',
        'title',
        'still_image_url',
        'overview',
        'air_date',
        'runtime_minutes',
    ];

    protected function casts(): array
    {
        return [
            'season_number' => 'integer',
            'episode_number' => 'integer',
            'air_date' => 'date',
            'runtime_minutes' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<Show, $this>
     */
    public function show(): BelongsTo
    {
        return $this->belongsTo(Show::class);
    }

    /**
     * Per-user watched-state rows for this episode (one per user who's toggled
     * it). Reads through this must always be scoped to a single user.
     *
     * @return HasMany<UserEpisodeWatch, $this>
     */
    public function watches(): HasMany
    {
        return $this->hasMany(UserEpisodeWatch::class);
    }
}
