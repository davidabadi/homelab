<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ImportScheduleBoardRequest extends FormRequest
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
            'version' => ['required', 'integer', Rule::in([3])],
            'mode' => ['nullable', Rule::in(['merge', 'replace'])],
            'resources' => ['required', 'array', 'list', 'max:500'],
            'resources.*.id' => ['required', 'string', 'max:255', 'distinct'],
            'resources.*.label' => ['required', 'string', 'max:255'],
            'resources.*.sub' => ['nullable', 'string', 'max:255'],
            'jobs' => ['required', 'array', 'list', 'max:5000'],
            'jobs.*.id' => ['required', 'string', 'max:255', 'distinct'],
            'jobs.*.name' => ['required', 'string', 'max:255'],
            'jobs.*.start' => ['required', 'date_format:H:i'],
            'jobs.*.dur' => ['required', 'integer', 'min:1', 'max:10080'],
            'jobs.*.days' => ['required', 'array', 'list', 'min:1', 'max:7'],
            'jobs.*.days.*' => ['required', 'integer', 'between:0,6'],
            'jobs.*.assigns' => ['present', 'array', 'list'],
            'jobs.*.assigns.*' => ['string', 'max:255'],
            'jobs.*.notes' => ['nullable', 'string', 'max:10000'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (! is_array($this->input('resources'))) {
            return;
        }

        $resources = array_map(static function (mixed $resource): mixed {
            if (! is_array($resource)) {
                return $resource;
            }

            $resource['label'] ??= $resource['name'] ?? null;
            $resource['sub'] ??= $resource['subtitle'] ?? null;

            return $resource;
        }, $this->input('resources'));

        $this->merge(['resources' => $resources]);
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($this->user() !== null
                    && $this->input('mode') === null
                    && ($this->user()->scheduleResources()->exists() || $this->user()->scheduleJobs()->exists())) {
                    $validator->errors()->add('mode', 'Choose merge or replace before importing into a non-empty board.');
                }

                $resourceIds = [];
                foreach ($this->input('resources', []) as $resource) {
                    if (is_array($resource) && is_string($resource['id'] ?? null)) {
                        $resourceIds[] = $resource['id'];
                    }
                }

                foreach ($this->input('jobs', []) as $jobIndex => $job) {
                    if (! is_array($job)) {
                        continue;
                    }

                    $days = $job['days'] ?? null;
                    if (is_array($days) && count($days) !== count(array_unique($days, SORT_REGULAR))) {
                        $validator->errors()->add(
                            "jobs.{$jobIndex}.days",
                            'A job may not contain the same weekday more than once.',
                        );
                    }

                    $assignments = $job['assigns'] ?? null;
                    if (! is_array($assignments)) {
                        continue;
                    }

                    if (count($assignments) !== count(array_unique($assignments, SORT_REGULAR))) {
                        $validator->errors()->add(
                            "jobs.{$jobIndex}.assigns",
                            'A job may not contain the same resource assignment more than once.',
                        );
                    }

                    foreach ($assignments as $assignmentIndex => $assignment) {
                        if (is_string($assignment) && ! in_array($assignment, $resourceIds, true)) {
                            $validator->errors()->add(
                                "jobs.{$jobIndex}.assigns.{$assignmentIndex}",
                                "The assigned resource '{$assignment}' is not present in the import.",
                            );
                        }
                    }
                }
            },
        ];
    }

    public function mode(): string
    {
        return $this->string('mode')->toString() ?: 'merge';
    }

    /**
     * Return the validated import as the canonical legacy-v3 domain shape.
     *
     * @return array{
     *   resources: list<array{id: string, label: string, sub: string|null}>,
     *   jobs: list<array{id: string, name: string, start: string, dur: int, days: list<int>, assigns: list<string>, notes: string|null}>
     * }
     */
    public function board(): array
    {
        $resources = [];
        foreach ($this->array('resources') as $resource) {
            if (! is_array($resource)) {
                continue;
            }

            $resources[] = [
                'id' => (string) ($resource['id'] ?? ''),
                'label' => (string) ($resource['label'] ?? ''),
                'sub' => isset($resource['sub']) ? (string) $resource['sub'] : null,
            ];
        }

        $jobs = [];
        foreach ($this->array('jobs') as $job) {
            if (! is_array($job)) {
                continue;
            }

            $days = is_array($job['days'] ?? null) ? $job['days'] : [];
            $assignments = is_array($job['assigns'] ?? null) ? $job['assigns'] : [];
            $jobs[] = [
                'id' => (string) ($job['id'] ?? ''),
                'name' => (string) ($job['name'] ?? ''),
                'start' => (string) ($job['start'] ?? ''),
                'dur' => (int) ($job['dur'] ?? 0),
                'days' => array_values(array_map(static fn (mixed $day): int => (int) $day, $days)),
                'assigns' => array_values(array_map(
                    static fn (mixed $assignment): string => (string) $assignment,
                    $assignments,
                )),
                'notes' => isset($job['notes']) ? (string) $job['notes'] : null,
            ];
        }

        return ['resources' => $resources, 'jobs' => $jobs];
    }
}
