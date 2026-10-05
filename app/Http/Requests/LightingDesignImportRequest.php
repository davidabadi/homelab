<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class LightingDesignImportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'document' => ['required'],
            'name' => [$this->routeIs('lighting.imports.store') ? 'required' : 'sometimes', 'string', 'max:255'],
            'resolutions' => ['sometimes', 'array', 'list', 'max:3000'],
            'resolutions.*' => ['array:catalog_ref,component_definition_id'],
            'resolutions.*.catalog_ref' => ['required', 'array:catalog_family_id,revision'],
            'resolutions.*.catalog_ref.catalog_family_id' => ['required', 'uuid'],
            'resolutions.*.catalog_ref.revision' => ['required', 'integer', 'min:1'],
            'resolutions.*.component_definition_id' => ['required', 'integer', 'min:1'],
        ];
    }
}
