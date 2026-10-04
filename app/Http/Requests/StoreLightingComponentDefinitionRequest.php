<?php

namespace App\Http\Requests;

use App\Services\Lighting\LightingGeometry;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use JsonException;

class StoreLightingComponentDefinitionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        foreach (['terminals', 'metadata'] as $field) {
            if (! is_string($this->input($field))) {
                continue;
            }
            try {
                $this->merge([$field => json_decode($this->input($field), true, flags: JSON_THROW_ON_ERROR)]);
            } catch (JsonException) {
                // Preserve malformed input so array validation returns a field error.
            }
        }
        $this->merge(LightingGeometry::normalizeMillimeters($this->all()));
        if (is_array($this->input('terminals'))) {
            $this->merge(['terminals' => array_map(
                static fn (mixed $terminal): mixed => is_array($terminal) ? LightingGeometry::normalizeMillimeters($terminal) : $terminal,
                $this->input('terminals'),
            )]);
        }
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'manufacturer' => ['required', 'string', 'max:255'],
            'model' => ['required', 'string', 'max:255'],
            'display_name' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string', 'max:100'],
            'kind' => ['required', Rule::in(['component', 'rail', 'duct'])],
            'sku' => ['nullable', 'string', 'max:255'],
            'width_mm' => ['required', 'numeric', 'min:0.01', 'max:1000000'],
            'height_mm' => ['required', 'numeric', 'min:0.01', 'max:1000000'],
            'depth_mm' => ['nullable', 'numeric', 'min:0.01', 'max:1000000'],
            'din_modules' => ['nullable', 'numeric', 'min:0.01', 'max:10000'],
            'mounting_type' => ['required', Rule::in(['din-rail', 'panel', 'pcb', 'free'])],
            'mounting_anchor_x_mm' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'mounting_anchor_y_mm' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'remove_image' => ['sometimes', 'boolean'],
            'image_url' => ['nullable', 'url:http,https', 'max:4000'],
            'datasheet_url' => ['nullable', 'url:http,https', 'max:4000'],
            'description' => ['nullable', 'string', 'max:10000'],
            'terminals' => ['present', 'array', 'list', 'max:200'],
            'terminals.*' => ['array:key,label,x_mm,y_mm,side,purpose,metadata'],
            'terminals.*.key' => ['required', 'string', 'max:100', 'distinct', 'regex:/^[A-Za-z0-9_.+-]+$/'],
            'terminals.*.label' => ['required', 'string', 'max:100'],
            'terminals.*.x_mm' => ['required', 'numeric', 'min:0', 'max:1000000'],
            'terminals.*.y_mm' => ['required', 'numeric', 'min:0', 'max:1000000'],
            'terminals.*.side' => ['required', Rule::in(['top', 'right', 'bottom', 'left'])],
            'terminals.*.purpose' => ['nullable', 'string', 'max:100'],
            'terminals.*.metadata' => ['nullable', 'array'],
            'metadata' => ['nullable', 'array'],
        ];
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }
                foreach ($this->input('terminals', []) as $index => $terminal) {
                    if ($terminal['x_mm'] > $this->input('width_mm') || $terminal['y_mm'] > $this->input('height_mm')) {
                        $validator->errors()->add("terminals.{$index}", 'Terminal positions must fit inside the component dimensions.');
                    }
                }
                foreach (['x' => 'width_mm', 'y' => 'height_mm'] as $axis => $dimension) {
                    if ($this->input("mounting_anchor_{$axis}_mm") > $this->input($dimension)) {
                        $validator->errors()->add("mounting_anchor_{$axis}_mm", 'The mounting anchor must fit inside the component dimensions.');
                    }
                }
            },
        ];
    }
}
