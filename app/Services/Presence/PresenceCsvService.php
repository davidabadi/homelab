<?php

namespace App\Services\Presence;

use App\Enums\PresenceTripStatus;
use App\Models\PresenceTrip;
use App\Models\User;
use DateTimeImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PresenceCsvService
{
    private const HEADERS = ['entry_date', 'exit_date', 'planned', 'notes'];

    /**
     * @return array{
     *   rows: list<array{row: int, entry_date: string, exit_date: string, planned: bool, status: string, notes: string|null, errors: list<string>, warnings: list<string>}>,
     *   errors: list<string>, valid: bool, total_rows: int, valid_rows: int, preview_hash: string
     * }
     */
    public function preview(User $user, UploadedFile $file, string $mode): array
    {
        $previewHash = $this->previewHash($file, $mode);
        $handle = fopen($file->getRealPath(), 'rb');

        if ($handle === false) {
            return $this->failedPreview($previewHash, 'The CSV file could not be read.');
        }

        try {
            $header = fgetcsv($handle, 0, ',', '"', '');

            if (! is_array($header)) {
                return $this->failedPreview($previewHash, 'The CSV file is empty.');
            }

            $header = array_map(
                static fn (mixed $value): string => Str::lower(Str::of((string) $value)->trim()->ltrim("\u{FEFF}")),
                $header,
            );

            if ($header !== self::HEADERS) {
                return $this->failedPreview(
                    $previewHash,
                    'Use exactly these columns in this order: entry_date,exit_date,planned,notes.',
                );
            }

            $rows = [];
            $lineNumber = 1;

            while (($values = fgetcsv($handle, 0, ',', '"', '')) !== false) {
                $lineNumber++;

                if ($this->blankRow($values)) {
                    continue;
                }

                if (count($rows) >= 5000) {
                    return $this->failedPreview($previewHash, 'The CSV may contain at most 5,000 data rows.');
                }

                $rows[] = $this->normalizeRow($values, $lineNumber);
            }
        } finally {
            fclose($handle);
        }

        $this->detectCsvConflicts($rows);

        if ($mode === 'append') {
            $existingTrips = $user->presenceTrips()->oldest('entry_date')->get();
            $this->detectExistingConflicts($rows, $existingTrips);
        }

        $validRows = collect($rows)->filter(fn (array $row): bool => $row['errors'] === [])->count();

        return [
            'rows' => $rows,
            'errors' => [],
            'valid' => $validRows === count($rows) && $rows !== [],
            'total_rows' => count($rows),
            'valid_rows' => $validRows,
            'preview_hash' => $previewHash,
        ];
    }

    public function previewHash(UploadedFile $file, string $mode): string
    {
        return hash('sha256', hash_file('sha256', $file->getRealPath())."\0".$mode);
    }

    /**
     * @param  list<array{row: int, entry_date: string, exit_date: string, planned: bool, status: string, notes: string|null, errors: list<string>, warnings: list<string>}>  $rows
     */
    public function import(User $user, array $rows, string $mode): int
    {
        return DB::transaction(function () use ($user, $rows, $mode): int {
            $lockedUser = User::query()->whereKey($user)->lockForUpdate()->firstOrFail();

            if ($mode === 'replace') {
                $lockedUser->presenceTrips()->delete();
            } else {
                $this->detectExistingConflicts($rows, $lockedUser->presenceTrips()->oldest('entry_date')->get());

                $rowErrors = collect($rows)
                    ->filter(fn (array $row): bool => $row['errors'] !== [])
                    ->mapWithKeys(fn (array $row): array => ["rows.{$row['row']}" => $row['errors']])
                    ->all();

                if ($rowErrors !== []) {
                    throw ValidationException::withMessages($rowErrors);
                }
            }

            foreach ($rows as $row) {
                $lockedUser->presenceTrips()->create([
                    'entry_date' => $row['entry_date'],
                    'exit_date' => $row['exit_date'],
                    'status' => $row['status'],
                    'notes' => $row['notes'],
                ]);
            }

            return count($rows);
        });
    }

    /** @param list<mixed> $values */
    private function blankRow(array $values): bool
    {
        return collect($values)->every(fn (mixed $value): bool => trim((string) $value) === '');
    }

    /**
     * @param  list<mixed>  $values
     * @return array{row: int, entry_date: string, exit_date: string, planned: bool, status: string, notes: string|null, errors: list<string>, warnings: list<string>}
     */
    private function normalizeRow(array $values, int $lineNumber): array
    {
        $errors = [];

        if (count($values) !== count(self::HEADERS)) {
            $errors[] = 'Expected exactly four columns.';
        }

        $values = array_pad(array_slice($values, 0, 4), 4, '');
        $entryDate = trim((string) $values[0]);
        $exitDate = trim((string) $values[1]);
        $plannedValue = Str::lower(trim((string) $values[2]));
        $notes = trim((string) $values[3]);

        if (! $this->validDate($entryDate)) {
            $errors[] = 'entry_date must be a real date in YYYY-MM-DD format.';
        }

        if (! $this->validDate($exitDate)) {
            $errors[] = 'exit_date must be a real date in YYYY-MM-DD format.';
        }

        if ($this->validDate($entryDate) && $this->validDate($exitDate) && $exitDate < $entryDate) {
            $errors[] = 'exit_date must be on or after entry_date.';
        }

        $planned = match ($plannedValue) {
            '1', 'true', 'yes', 'y', 'planned' => true,
            '0', 'false', 'no', 'n', 'confirmed' => false,
            default => null,
        };

        if ($planned === null) {
            $errors[] = 'planned must be true/false, yes/no, 1/0, planned, or confirmed.';
        }

        if (Str::length($notes) > 5000) {
            $errors[] = 'notes may not be longer than 5,000 characters.';
        }

        return [
            'row' => $lineNumber,
            'entry_date' => $entryDate,
            'exit_date' => $exitDate,
            'planned' => $planned ?? false,
            'status' => ($planned ?? false)
                ? PresenceTripStatus::Planned->value
                : PresenceTripStatus::Confirmed->value,
            'notes' => $notes === '' ? null : $notes,
            'errors' => $errors,
            'warnings' => [],
        ];
    }

    private function validDate(string $value): bool
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

        return $date !== false && $date->format('Y-m-d') === $value;
    }

    /**
     * @param  list<array{row: int, entry_date: string, exit_date: string, planned: bool, status: string, notes: string|null, errors: list<string>, warnings: list<string>}>  $rows
     */
    private function detectCsvConflicts(array &$rows): void
    {
        foreach ($rows as $index => &$row) {
            if ($row['errors'] !== []) {
                continue;
            }

            for ($otherIndex = 0; $otherIndex < $index; $otherIndex++) {
                $other = $rows[$otherIndex];

                if ($other['errors'] !== [] || ! $this->overlaps($row, $other)) {
                    continue;
                }

                if ($row['entry_date'] === $other['entry_date']
                    && $row['exit_date'] === $other['exit_date']
                    && $row['status'] === $other['status']) {
                    $row['errors'][] = "Duplicates CSV row {$other['row']}.";

                    continue;
                }

                if (! $row['planned'] && ! $other['planned']) {
                    $row['errors'][] = "Overlaps confirmed CSV row {$other['row']}.";
                } else {
                    $row['warnings'][] = "Overlaps CSV row {$other['row']}; projected totals will count shared days once.";
                }
            }
        }
        unset($row);
    }

    /**
     * @param  list<array{row: int, entry_date: string, exit_date: string, planned: bool, status: string, notes: string|null, errors: list<string>, warnings: list<string>}>  $rows
     * @param  iterable<PresenceTrip>  $existingTrips
     */
    private function detectExistingConflicts(array &$rows, iterable $existingTrips): void
    {
        foreach ($rows as &$row) {
            if ($row['errors'] !== []) {
                continue;
            }

            foreach ($existingTrips as $trip) {
                $existing = [
                    'entry_date' => $trip->entry_date->toDateString(),
                    'exit_date' => $trip->exit_date->toDateString(),
                ];

                if (! $this->overlaps($row, $existing)) {
                    continue;
                }

                if ($row['entry_date'] === $existing['entry_date']
                    && $row['exit_date'] === $existing['exit_date']
                    && $row['status'] === $trip->status->value) {
                    $row['errors'][] = "Duplicates existing trip #{$trip->id}.";

                    continue;
                }

                if (! $row['planned'] && $trip->status === PresenceTripStatus::Confirmed) {
                    $row['errors'][] = "Overlaps confirmed existing trip #{$trip->id}.";
                } else {
                    $row['warnings'][] = "Overlaps existing trip #{$trip->id}; projected totals will count shared days once.";
                }
            }
        }
        unset($row);
    }

    /** @param array{entry_date: string, exit_date: string} $left
     * @param  array{entry_date: string, exit_date: string}  $right
     */
    private function overlaps(array $left, array $right): bool
    {
        return $left['entry_date'] <= $right['exit_date'] && $left['exit_date'] >= $right['entry_date'];
    }

    /** @return array{rows: list<mixed>, errors: list<string>, valid: bool, total_rows: int, valid_rows: int, preview_hash: string} */
    private function failedPreview(string $previewHash, string $message): array
    {
        return [
            'rows' => [],
            'errors' => [$message],
            'valid' => false,
            'total_rows' => 0,
            'valid_rows' => 0,
            'preview_hash' => $previewHash,
        ];
    }
}
