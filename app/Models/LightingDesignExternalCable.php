<?php

namespace App\Models;

use Database\Factories\LightingDesignExternalCableFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LightingDesignExternalCable extends Model
{
    /** @use HasFactory<LightingDesignExternalCableFactory> */
    use HasFactory;

    protected $fillable = [
        'design_id', 'portable_id', 'bundle_id', 'cable_entry_id', 'label', 'cable_type', 'gauge',
        'conductor_count', 'internal_component_id', 'internal_terminal', 'branch_route_points',
        'cable_class', 'direction', 'notes', 'metadata',
    ];

    protected function casts(): array
    {
        return ['conductor_count' => 'integer', 'branch_route_points' => 'array', 'metadata' => 'array'];
    }

    /** @return BelongsTo<LightingDesign, $this> */
    public function design(): BelongsTo
    {
        return $this->belongsTo(LightingDesign::class, 'design_id');
    }

    /** @return BelongsTo<LightingDesignCableBundle, $this> */
    public function bundle(): BelongsTo
    {
        return $this->belongsTo(LightingDesignCableBundle::class, 'bundle_id');
    }

    /** @return BelongsTo<LightingDesignCableEntry, $this> */
    public function entry(): BelongsTo
    {
        return $this->belongsTo(LightingDesignCableEntry::class, 'cable_entry_id');
    }

    /** @return BelongsTo<LightingDesignComponent, $this> */
    public function internalComponent(): BelongsTo
    {
        return $this->belongsTo(LightingDesignComponent::class, 'internal_component_id');
    }
}
