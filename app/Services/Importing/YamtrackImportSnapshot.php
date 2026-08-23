<?php

declare(strict_types=1);

namespace App\Services\Importing;

use App\Enums\YamtrackMediaType;

final class YamtrackImportSnapshot
{
    /** @var array<int, array{title: ?string, status: ?string, completed: bool, has_tv: bool, rows: list<int>}> */
    public array $shows = [];

    /** @var array<string, YamtrackImportRow> */
    public array $episodes = [];

    /** @var array<int, array{row: YamtrackImportRow, rows: list<int>}> */
    public array $movies = [];

    public function add(YamtrackImportRow $row): void
    {
        if ($row->mediaType === YamtrackMediaType::Movie) {
            $movie = $this->movies[$row->mediaId] ?? ['row' => $row, 'rows' => []];
            $movie['row'] = $row;
            $movie['rows'][] = $row->rowNumber;
            $this->movies[$row->mediaId] = $movie;

            return;
        }

        $show = $this->shows[$row->mediaId] ?? [
            'title' => $row->title,
            'status' => null,
            'completed' => false,
            'has_tv' => false,
            'rows' => [],
        ];
        $show['rows'][] = $row->rowNumber;

        if ($row->mediaType === YamtrackMediaType::Tv) {
            $show['title'] = $row->title ?? $show['title'];
            $show['status'] = $row->status;
            $show['completed'] = $row->status === 'completed';
            $show['has_tv'] = true;
        } elseif (! $show['has_tv'] && $show['status'] === null && $row->status !== null) {
            $show['status'] = $row->status;
            $show['completed'] = $row->status === 'completed';
        }

        $show['title'] ??= $row->title;

        $this->shows[$row->mediaId] = $show;

        if ($row->mediaType === YamtrackMediaType::Episode) {
            $this->episodes[$row->episodeKey()] = $row;
        }
    }
}
