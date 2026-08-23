<?php

declare(strict_types=1);

namespace App\Services\Importing;

use App\Enums\YamtrackMediaType;
use Carbon\CarbonImmutable;

final readonly class YamtrackImportRow
{
    public function __construct(
        public int $rowNumber,
        public int $mediaId,
        public YamtrackMediaType $mediaType,
        public ?string $title,
        public ?int $seasonNumber,
        public ?int $episodeNumber,
        public ?string $status,
        public ?CarbonImmutable $watchedAt,
    ) {}

    public function episodeKey(): string
    {
        return "{$this->mediaId}:{$this->seasonNumber}:{$this->episodeNumber}";
    }
}
