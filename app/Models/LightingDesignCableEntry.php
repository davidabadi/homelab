<?php

namespace App\Models;

use Database\Factories\LightingDesignCableEntryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LightingDesignCableEntry extends Model
{
    /** @use HasFactory<LightingDesignCableEntryFactory> */
    use HasFactory;

    protected $fillable = ['design_id', 'portable_id', 'label', 'side', 'offset_mm', 'span_mm', 'entry_type', 'notes', 'metadata'];

    protected function casts(): array
    {
        return ['offset_mm' => 'float', 'span_mm' => 'float', 'metadata' => 'array'];
    }

    /** @return BelongsTo<LightingDesign, $this> */
    public function design(): BelongsTo
    {
        return $this->belongsTo(LightingDesign::class, 'design_id');
    }

    /** @return HasMany<LightingDesignCableBundle, $this> */
    public function bundles(): HasMany
    {
        return $this->hasMany(LightingDesignCableBundle::class, 'cable_entry_id');
    }

    /** @return HasMany<LightingDesignExternalCable, $this> */
    public function externalCables(): HasMany
    {
        return $this->hasMany(LightingDesignExternalCable::class, 'cable_entry_id');
    }
}
