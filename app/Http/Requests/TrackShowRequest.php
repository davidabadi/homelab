<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a "track this show" request. New tracking rows always start in
 * Watching; status changes use the dedicated update endpoints.
 */
class TrackShowRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // auth + verified enforced by route middleware
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'tmdb_id' => ['required', 'integer', 'min:1'],
        ];
    }
}
