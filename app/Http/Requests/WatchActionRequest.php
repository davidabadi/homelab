<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\WatchAction;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Enum;

/**
 * Validates a multi-watch toggle action for a single episode or movie (spec §10
 * item 6, extended): watched status is a count now, so the tap is no longer a
 * plain toggle. The client sends an explicit `action` — increment (mark watched
 * again), set_once (collapse to exactly one watch), or reset (mark not watched).
 *
 * Absent for backwards-compatible callers that just want the simple "mark
 * watched" tap, `action` defaults to increment.
 */
class WatchActionRequest extends FormRequest
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
            'action' => ['sometimes', new Enum(WatchAction::class)],
        ];
    }

    public function action(): WatchAction
    {
        return WatchAction::tryFrom((string) $this->input('action')) ?? WatchAction::Increment;
    }
}
