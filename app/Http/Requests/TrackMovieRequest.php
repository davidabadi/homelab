<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a "track this movie" request: just a TMDB id. A newly tracked
 * movie starts unwatched (spec §10 item 5).
 */
class TrackMovieRequest extends FormRequest
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
