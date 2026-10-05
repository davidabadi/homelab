<?php

namespace App\Http\Requests;

use App\Services\Lighting\LightingGeometry;
use App\Services\Lighting\LightingRowLayout;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreLightingDesignRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(LightingGeometry::normalizeMillimeters($this->all()));
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return self::designRules();
    }

    /** @return array<string, array<mixed>> */
    public static function designRules(string $prefix = '', bool $complete = false): array
    {
        $presence = $complete ? 'required' : 'sometimes';

        return [
            "{$prefix}name" => ['required', 'string', 'max:255'],
            "{$prefix}width_mm" => [$presence, 'numeric', 'min:1', 'max:1000000'],
            "{$prefix}height_mm" => [$presence, 'numeric', 'min:1', 'max:1000000'],
            "{$prefix}depth_mm" => [$complete ? 'present' : 'sometimes', 'nullable', 'numeric', 'min:0.01', 'max:1000000'],
            "{$prefix}margin_top_mm" => [$presence, 'numeric', 'min:0', 'max:1000000'],
            "{$prefix}margin_right_mm" => [$presence, 'numeric', 'min:0', 'max:1000000'],
            "{$prefix}margin_bottom_mm" => [$presence, 'numeric', 'min:0', 'max:1000000'],
            "{$prefix}margin_left_mm" => [$presence, 'numeric', 'min:0', 'max:1000000'],
            "{$prefix}grid_size_mm" => [$presence, 'numeric', 'min:0.1', 'max:1000'],
            "{$prefix}snap_to_grid" => [$presence, 'boolean'],
            "{$prefix}notes" => [$complete ? 'present' : 'sometimes', 'nullable', 'string', 'max:10000'],
        ];
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                self::validateMargins($validator, $this->validatedDesignInput());
            },
        ];
    }

    /** @return array<string, mixed> */
    protected function validatedDesignInput(): array
    {
        return [
            ...LightingRowLayout::DESIGN_DEFAULTS,
            ...$this->only(['width_mm', 'height_mm', 'margin_left_mm', 'margin_right_mm', 'margin_top_mm', 'margin_bottom_mm']),
        ];
    }

    /** @param array<string, mixed> $design */
    public static function validateMargins(Validator $validator, array $design, string $prefix = ''): void
    {
        if ($validator->errors()->isNotEmpty()) {
            return;
        }

        if (($design['margin_left_mm'] ?? 0) + ($design['margin_right_mm'] ?? 0) >= ($design['width_mm'] ?? 600)) {
            $validator->errors()->add("{$prefix}margin_left_mm", 'Horizontal margins must leave usable enclosure space.');
        }

        if (($design['margin_top_mm'] ?? 0) + ($design['margin_bottom_mm'] ?? 0) >= ($design['height_mm'] ?? 800)) {
            $validator->errors()->add("{$prefix}margin_top_mm", 'Vertical margins must leave usable enclosure space.');
        }
    }
}
