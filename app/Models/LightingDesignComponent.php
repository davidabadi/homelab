<?php

namespace App\Models;

use Database\Factories\LightingDesignComponentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $design_id
 * @property string $portable_id
 * @property int|null $component_definition_id
 */
class LightingDesignComponent extends Model
{
    /** @use HasFactory<LightingDesignComponentFactory> */
    use HasFactory;

    protected $fillable = ['design_id', 'portable_id', 'component_definition_id', 'rail_id', 'sort_order', 'x_mm', 'y_mm', 'rotation', 'custom_label', 'notes', 'metadata'];

    protected function casts(): array
    {
        return ['sort_order' => 'integer', 'x_mm' => 'float', 'y_mm' => 'float', 'rotation' => 'integer', 'metadata' => 'array'];
    }

    /** @return BelongsTo<LightingDesign, $this> */
    public function design(): BelongsTo
    {
        return $this->belongsTo(LightingDesign::class, 'design_id');
    }

    /** @return BelongsTo<LightingComponentDefinition, $this> */
    public function definition(): BelongsTo
    {
        return $this->belongsTo(LightingComponentDefinition::class, 'component_definition_id');
    }

    /** @return BelongsTo<LightingDesignRail, $this> */
    public function rail(): BelongsTo
    {
        return $this->belongsTo(LightingDesignRail::class);
    }
}
