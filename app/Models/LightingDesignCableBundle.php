<?php

namespace App\Models;

use Database\Factories\LightingDesignCableBundleFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LightingDesignCableBundle extends Model
{
    /** @use HasFactory<LightingDesignCableBundleFactory> */
    use HasFactory;

    protected $fillable = [
        'design_id', 'portable_id', 'cable_entry_id', 'name', 'external_location', 'cable_class',
        'direction', 'display_color', 'planned_count', 'route_points', 'notes', 'metadata',
    ];

    protected function casts(): array
    {
        return ['planned_count' => 'integer', 'route_points' => 'array', 'metadata' => 'array'];
    }

    /** @return BelongsTo<LightingDesign, $this> */
    public function design(): BelongsTo
    {
        return $this->belongsTo(LightingDesign::class, 'design_id');
    }

    /** @return BelongsTo<LightingDesignCableEntry, $this> */
    public function entry(): BelongsTo
    {
        return $this->belongsTo(LightingDesignCableEntry::class, 'cable_entry_id');
    }

    /** @return HasMany<LightingDesignExternalCable, $this> */
    public function cables(): HasMany
    {
        return $this->hasMany(LightingDesignExternalCable::class, 'bundle_id');
    }
}
