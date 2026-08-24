<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

class ImportPresenceCsvRequest extends PreviewPresenceCsvRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function rules(): array
    {
        return [
            'csv' => [
                'required',
                'file',
                'extensions:csv,txt',
                'mimetypes:text/plain,text/csv,application/csv,application/vnd.ms-excel',
                'max:5120',
            ],
            'mode' => ['required', Rule::in(['append', 'replace'])],
            'preview_hash' => ['required', 'string', 'size:64'],
        ];
    }
}
