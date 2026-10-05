<?php

namespace App\Models;

use Database\Factories\LightingDesignConnectionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $design_id
 * @property string $portable_id
 * @property int $source_component_id
 * @property int $target_component_id
 * @property list<array{x_mm: float, y_mm: float}> $route_points
 */
class LightingDesignConnection extends Model
{
    /** @use HasFactory<LightingDesignConnectionFactory> */
    use HasFactory;

    protected $fillable = ['design_id', 'portable_id', 'source_component_id', 'source_terminal', 'target_component_id', 'target_terminal', 'cable_type', 'color', 'gauge', 'conductor_count', 'route_points', 'actual_length_mm', 'notes'];

    protected function casts(): array
    {
        return ['conductor_count' => 'integer', 'route_points' => 'array', 'actual_length_mm' => 'float'];
    }

    /** @return BelongsTo<LightingDesign, $this> */
    public function design(): BelongsTo
    {
        return $this->belongsTo(LightingDesign::class, 'design_id');
    }

    /** @return BelongsTo<LightingDesignComponent, $this> */
    public function sourceComponent(): BelongsTo
    {
        return $this->belongsTo(LightingDesignComponent::class, 'source_component_id');
    }

    /** @return BelongsTo<LightingDesignComponent, $this> */
    public function targetComponent(): BelongsTo
    {
        return $this->belongsTo(LightingDesignComponent::class, 'target_component_id');
    }
}
