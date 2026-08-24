<?php

namespace App\Http\Requests;

use App\Enums\PresenceTripStatus;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePresenceTripRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'entry_date' => ['required', 'date_format:Y-m-d'],
            'exit_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:entry_date'],
            'status' => ['required', Rule::enum(PresenceTripStatus::class)],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /** @return array{entry_date: string, exit_date: string, status: string, notes: string|null} */
    public function tripAttributes(): array
    {
        return [
            'entry_date' => $this->string('entry_date')->toString(),
            'exit_date' => $this->string('exit_date')->toString(),
            'status' => $this->string('status')->toString(),
            'notes' => $this->filled('notes') ? $this->string('notes')->toString() : null,
        ];
    }
}
