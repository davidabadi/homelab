<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\ShowStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates the left-swipe status move for a tracked show (spec Part 2 §2). Only
 * the two statuses the row's action sheet can set are accepted — "Watch Later"
 * and "Stop Watching"; promotion back to Watching happens automatically on watch
 * activity (TrackingStatusService), and Finished is only ever derived, so neither
 * is a valid target here.
 */
class SetShowStatusRequest extends FormRequest
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
            'status' => ['required', Rule::in([
                ShowStatus::WatchLater->value,
                ShowStatus::Stopped->value,
            ])],
        ];
    }

    public function status(): ShowStatus
    {
        return ShowStatus::from((string) $this->input('status'));
    }
}
