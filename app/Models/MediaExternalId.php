<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Maps a shared Show/Movie row to a provider lookup key (spec §3). Our DB is
 * the source of truth; providers are external references hung off it.
 *
 * Polymorphic via (media_type, media_id), where media_type is the 'show'|'movie'
 * morph alias registered in AppServiceProvider::boot().
 *
 * @property int $id
 * @property string $media_type
 * @property int $media_id
 * @property string $provider
 * @property string $external_id
 */
class MediaExternalId extends Model
{
    protected $fillable = ['media_type', 'media_id', 'provider', 'external_id'];

    /**
     * @return MorphTo<Model, $this>
     */
    public function media(): MorphTo
    {
        return $this->morphTo(null, 'media_type', 'media_id');
    }
}
