<?php

namespace App\Models;

use Database\Factories\LightingDesignFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int $user_id
 * @property string $name
 * @property float $margin_top_mm
 * @property float $margin_right_mm
 * @property float $margin_bottom_mm
 * @property float $margin_left_mm
 * @property int $save_version
 * @property string|null $last_mutation_id
 * @property string|null $last_mutation_hash
 */
class LightingDesign extends Model
{
    /** @use HasFactory<LightingDesignFactory> */
    use HasFactory;

    public const EDITABLE_FIELDS = [
        'name', 'width_mm', 'height_mm', 'depth_mm', 'margin_top_mm', 'margin_right_mm',
        'margin_bottom_mm', 'margin_left_mm', 'grid_size_mm', 'snap_to_grid', 'notes', 'metadata',
    ];

    protected $fillable = [
        'user_id', ...self::EDITABLE_FIELDS, 'save_version', 'last_mutation_id', 'last_mutation_hash',
    ];

    protected function casts(): array
    {
        return [
            'width_mm' => 'float', 'height_mm' => 'float', 'depth_mm' => 'float',
            'margin_top_mm' => 'float', 'margin_right_mm' => 'float',
            'margin_bottom_mm' => 'float', 'margin_left_mm' => 'float',
            'grid_size_mm' => 'float', 'snap_to_grid' => 'boolean', 'save_version' => 'integer', 'metadata' => 'array',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<LightingDesignComponent, $this> */
    public function components(): HasMany
    {
        return $this->hasMany(LightingDesignComponent::class, 'design_id');
    }

    /** @return HasMany<LightingDesignRail, $this> */
    public function rails(): HasMany
    {
        return $this->hasMany(LightingDesignRail::class, 'design_id');
    }

    /** @return HasMany<LightingDesignDuct, $this> */
    public function ducts(): HasMany
    {
        return $this->hasMany(LightingDesignDuct::class, 'design_id');
    }

    /** @return HasMany<LightingDesignConnection, $this> */
    public function connections(): HasMany
    {
        return $this->hasMany(LightingDesignConnection::class, 'design_id');
    }

    /** @return HasMany<LightingDesignCableEntry, $this> */
    public function cableEntries(): HasMany
    {
        return $this->hasMany(LightingDesignCableEntry::class, 'design_id');
    }

    /** @return HasMany<LightingDesignCableBundle, $this> */
    public function cableBundles(): HasMany
    {
        return $this->hasMany(LightingDesignCableBundle::class, 'design_id');
    }

    /** @return HasMany<LightingDesignExternalCable, $this> */
    public function externalCables(): HasMany
    {
        return $this->hasMany(LightingDesignExternalCable::class, 'design_id');
    }
}
