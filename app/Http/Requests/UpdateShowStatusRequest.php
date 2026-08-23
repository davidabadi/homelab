<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\ShowStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates a status move for an already-tracked show (spec §10 item 5,
 * "set status"). Status is required here — this endpoint exists only to change
 * it.
 */
class UpdateShowStatusRequest extends FormRequest
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
            'status' => ['required', Rule::enum(ShowStatus::class)],
        ];
    }

    public function status(): ShowStatus
    {
        return ShowStatus::from((string) $this->input('status'));
    }
}
