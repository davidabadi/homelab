<?php

declare(strict_types=1);

namespace App\Services\Importing;

use App\Enums\YamtrackMediaType;
use Carbon\CarbonImmutable;
use Generator;
use Illuminate\Support\Str;
use InvalidArgumentException;
use SplFileObject;
use Throwable;

final class YamtrackCsvReader
{
    public const HEADERS = [
        'media_id', 'source', 'media_type', 'title', 'image', 'season_number',
        'episode_number', 'score', 'status', 'notes', 'start_date', 'end_date',
        'progress', 'created_at', 'progressed_at',
    ];

    private const REQUIRED_HEADERS = ['media_id', 'source', 'media_type'];

    /** @return list<string> */
    public function headers(string $path): array
    {
        $file = $this->open($path);
        $header = $file->fgetcsv();

        if (! is_array($header)) {
            throw new InvalidArgumentException('The CSV file does not contain a readable header row.');
        }

        return array_map(
            static fn (mixed $value): string => trim((string) $value, " \t\n\r\0\x0B\xEF\xBB\xBF"),
            $header,
        );
    }

    public function validateHeaders(string $path): void
    {
        $missing = array_values(array_diff(self::REQUIRED_HEADERS, $this->headers($path)));

        if ($missing !== []) {
            throw new InvalidArgumentException('Missing required CSV headers: '.implode(', ', $missing).'.');
        }
    }

    public function countRows(string $path): int
    {
        $file = $this->open($path);
        $file->fgetcsv();
        $count = 0;

        while (! $file->eof()) {
            $row = $file->fgetcsv();
            if ($this->hasValues($row)) {
                $count++;
            }
        }

        return $count;
    }

    /**
     * @param  callable(int, string): void  $onError
     * @return Generator<int, YamtrackImportRow>
     */
    public function rows(string $path, callable $onError): Generator
    {
        $headers = $this->headers($path);
        $file = $this->open($path);
        $file->fgetcsv();
        $rowNumber = 1;

        while (! $file->eof()) {
            $values = $file->fgetcsv();
            $rowNumber++;

            if (! $this->hasValues($values)) {
                continue;
            }

            if (! is_array($values) || count($values) !== count($headers)) {
                $onError($rowNumber, 'Column count does not match the header.');

                continue;
            }

            /** @var array<string, string> $row */
            $row = array_combine($headers, array_map(static fn (mixed $value): string => trim((string) $value), $values));

            try {
                yield $this->normalize($rowNumber, $row);
            } catch (InvalidArgumentException $exception) {
                $onError($rowNumber, $exception->getMessage());
            }
        }
    }

    /** @param array<string, string> $row */
    private function normalize(int $rowNumber, array $row): YamtrackImportRow
    {
        if (mb_strtolower($row['source'] ?? '') !== 'tmdb') {
            throw new InvalidArgumentException('Only source=tmdb is supported.');
        }

        $mediaId = filter_var($row['media_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($mediaId === false) {
            throw new InvalidArgumentException('media_id must be a positive integer.');
        }

        $mediaType = YamtrackMediaType::tryFrom(mb_strtolower($row['media_type'] ?? ''));
        if ($mediaType === null) {
            throw new InvalidArgumentException('Unsupported media_type.');
        }

        $seasonNumber = $this->coordinate($row['season_number'] ?? '', 0);
        $episodeNumber = $this->coordinate($row['episode_number'] ?? '', 1);

        if (in_array($mediaType, [YamtrackMediaType::Season, YamtrackMediaType::Episode], true) && $seasonNumber === null) {
            throw new InvalidArgumentException('season_number is required and must be zero or greater.');
        }

        if ($mediaType === YamtrackMediaType::Episode && $episodeNumber === null) {
            throw new InvalidArgumentException('episode_number is required and must be positive.');
        }

        return new YamtrackImportRow(
            rowNumber: $rowNumber,
            mediaId: $mediaId,
            mediaType: $mediaType,
            title: $this->title($row['title'] ?? ''),
            seasonNumber: $seasonNumber,
            episodeNumber: $episodeNumber,
            status: $this->status($row['status'] ?? ''),
            watchedAt: $this->watchedAt($row['end_date'] ?? '', $row['progressed_at'] ?? ''),
        );
    }

    private function coordinate(string $value, int $minimum): ?int
    {
        if ($value === '') {
            return null;
        }

        $coordinate = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => $minimum]]);

        return $coordinate === false ? null : $coordinate;
    }

    private function status(string $status): ?string
    {
        $status = mb_strtolower(trim($status));

        return $status === '' ? null : $status;
    }

    private function title(string $title): ?string
    {
        $title = Str::limit(Str::squish($title), 200, '');

        return $title === '' ? null : $title;
    }

    private function watchedAt(string $endDate, string $progressedAt): ?CarbonImmutable
    {
        foreach ([$endDate, $progressedAt] as $timestamp) {
            if ($timestamp === '') {
                continue;
            }

            try {
                return CarbonImmutable::parse($timestamp)->utc();
            } catch (Throwable) {
                continue;
            }
        }

        return null;
    }

    private function open(string $path): SplFileObject
    {
        if (! is_file($path) || ! is_readable($path)) {
            throw new InvalidArgumentException('The CSV file is not readable.');
        }

        $file = new SplFileObject($path, 'r');
        $file->setCsvControl(',', '"', '');

        return $file;
    }

    /** @param array<int, string|null>|false $row */
    private function hasValues(array|false $row): bool
    {
        return is_array($row)
            && $row !== [null]
            && array_filter($row, static fn (mixed $value): bool => trim((string) $value) !== '') !== [];
    }
}
