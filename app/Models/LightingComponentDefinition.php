<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\LightingComponentDefinitionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $catalog_family_id
 * @property int $revision
 * @property string $kind
 * @property string $mounting_type
 * @property float $width_mm
 * @property float $height_mm
 * @property string|null $image_path
 * @property CarbonImmutable|null $archived_at
 * @property list<array{key: string, label: string, x_mm: float, y_mm: float, side: string, purpose: string|null, metadata?: array<string, mixed>}> $terminals
 * @property array<string, mixed>|null $metadata
 */
class LightingComponentDefinition extends Model
{
    /** @use HasFactory<LightingComponentDefinitionFactory> */
    use HasFactory;

    protected $fillable = [
        'catalog_family_id', 'revision', 'manufacturer', 'model', 'display_name', 'category',
        'kind', 'sku', 'width_mm', 'height_mm', 'depth_mm', 'din_modules', 'mounting_type',
        'mounting_anchor_x_mm', 'mounting_anchor_y_mm', 'image_path', 'image_url',
        'datasheet_url', 'description', 'terminals', 'metadata', 'archived_at',
    ];

    protected function casts(): array
    {
        return [
            'revision' => 'integer', 'width_mm' => 'float', 'height_mm' => 'float',
            'depth_mm' => 'float', 'din_modules' => 'float', 'mounting_anchor_x_mm' => 'float',
            'mounting_anchor_y_mm' => 'float', 'terminals' => 'array', 'metadata' => 'array',
            'archived_at' => 'immutable_datetime',
        ];
    }

    /** @return HasMany<LightingDesignComponent, $this> */
    public function placements(): HasMany
    {
        return $this->hasMany(LightingDesignComponent::class, 'component_definition_id');
    }
}
