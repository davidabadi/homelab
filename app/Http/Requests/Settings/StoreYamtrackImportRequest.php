<?php

declare(strict_types=1);

namespace App\Http\Requests\Settings;

use App\Enums\YamtrackImportStrategy;
use App\Models\YamtrackImport;
use App\Services\Importing\YamtrackCsvReader;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use Throwable;

class StoreYamtrackImportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'file' => [
                'required',
                'file',
                'max:20480',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (! $value instanceof UploadedFile
                        || ! $value->isValid()
                        || mb_strtolower($value->getClientOriginalExtension()) !== 'csv') {
                        $fail('Choose a readable .csv file.');
                    }
                },
            ],
            'strategy' => ['required', Rule::enum(YamtrackImportStrategy::class)],
            'replace_confirmed' => [
                Rule::requiredIf($this->string('strategy')->toString() === YamtrackImportStrategy::Replace->value),
                Rule::when(
                    $this->string('strategy')->toString() === YamtrackImportStrategy::Replace->value,
                    ['accepted'],
                ),
            ],
        ];
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->has('file')) {
                    return;
                }

                $file = $this->file('file');
                if ($file === null) {
                    return;
                }

                try {
                    app(YamtrackCsvReader::class)->validateHeaders($file->getRealPath());
                } catch (Throwable $exception) {
                    $validator->errors()->add('file', $exception->getMessage());
                }

                if (YamtrackImport::query()->where('active_user_id', $this->user()?->id)->exists()) {
                    $validator->errors()->add('file', 'Wait for your current Yamtrack import to finish before starting another.');
                }
            },
        ];
    }

    public function strategy(): YamtrackImportStrategy
    {
        return YamtrackImportStrategy::from($this->string('strategy')->toString());
    }
}
