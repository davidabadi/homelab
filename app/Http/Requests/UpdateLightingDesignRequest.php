<?php

namespace App\Http\Requests;

class UpdateLightingDesignRequest extends StoreLightingDesignRequest
{
    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return ['name' => ['required', 'string', 'max:255']];
    }
}
