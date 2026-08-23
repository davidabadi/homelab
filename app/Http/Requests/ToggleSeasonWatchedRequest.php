<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a season bulk watched-toggle (spec §10 item 6, "mark whole season
 * watched"). The target state is explicit — `watched=true` marks every episode
 * in the season watched, `watched=false` clears them — so the batch operation is
 * unambiguous regardless of the episodes' current mixed states.
 */
class ToggleSeasonWatchedRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // ownership is enforced in the controller via the user scope
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'watched' => ['required', 'boolean'],
        ];
    }

    public function watched(): bool
    {
        return $this->boolean('watched');
    }
}
