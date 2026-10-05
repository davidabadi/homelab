<?php

namespace App\Models;

use Database\Factories\LightingDesignDuctFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $design_id
 * @property string $portable_id
 * @property int|null $component_definition_id
 */
class LightingDesignDuct extends Model
{
    /** @use HasFactory<LightingDesignDuctFactory> */
    use HasFactory;

    protected $fillable = ['design_id', 'portable_id', 'component_definition_id', 'x_mm', 'y_mm', 'length_mm', 'width_mm', 'orientation'];

    protected function casts(): array
    {
        return ['x_mm' => 'float', 'y_mm' => 'float', 'length_mm' => 'float', 'width_mm' => 'float'];
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
}
