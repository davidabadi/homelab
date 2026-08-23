<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\ShowFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * Shared show metadata (spec §4) — one row per title regardless of who tracks
 * it. Seasons/episodes are pulled once at track time and reused household-wide.
 *
 * @property int $id
 * @property string $title
 * @property string|null $poster_image_url
 * @property string|null $overview
 * @property bool $ended TMDB reports the show as concluded (Ended/Canceled)
 */
class Show extends Model
{
    /** @use HasFactory<ShowFactory> */
    use HasFactory;

    protected $fillable = ['title', 'poster_image_url', 'overview', 'ended'];

    protected function casts(): array
    {
        return [
            'ended' => 'boolean',
        ];
    }

    /**
     * @return HasMany<Season, $this>
     */
    public function seasons(): HasMany
    {
        return $this->hasMany(Season::class);
    }

    /**
     * @return HasMany<Episode, $this>
     */
    public function episodes(): HasMany
    {
        return $this->hasMany(Episode::class);
    }

    /**
     * @return HasMany<UserShowTracking, $this>
     */
    public function trackings(): HasMany
    {
        return $this->hasMany(UserShowTracking::class);
    }

    /**
     * Provider lookup keys (tmdb, trakt, ...) attached to this show.
     *
     * @return MorphMany<MediaExternalId, $this>
     */
    public function externalIds(): MorphMany
    {
        return $this->morphMany(MediaExternalId::class, 'media', 'media_type', 'media_id');
    }
}
