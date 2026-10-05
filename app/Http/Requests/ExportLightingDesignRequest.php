<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ExportLightingDesignRequest extends FormRequest
{
    public function authorize(): bool
    {
        if ($this->user() === null) {
            return false;
        }
        $this->user()->lightingDesigns()->findOrFail($this->route('design'));

        return true;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return ['layout' => ['required', 'array:design,components,rails,ducts,connections,cable_entries,cable_bundles,external_cables']];
    }
}
