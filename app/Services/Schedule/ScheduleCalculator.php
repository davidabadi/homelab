<?php

namespace App\Services\Schedule;

use App\Models\ScheduleJob;
use App\Models\ScheduleResource;
use Illuminate\Support\Collection;

class ScheduleCalculator
{
    private const MINUTES_PER_DAY = 1440;

    private const MINUTES_PER_WEEK = 10080;

    /**
     * @param  Collection<int, ScheduleJob>  $jobs
     * @return list<array<string, mixed>>
     */
    public function conflicts(Collection $jobs): array
    {
        $jobs = $jobs->values();
        $conflicts = [];

        for ($leftIndex = 0; $leftIndex < $jobs->count(); $leftIndex++) {
            for ($rightIndex = $leftIndex + 1; $rightIndex < $jobs->count(); $rightIndex++) {
                $left = $jobs[$leftIndex];
                $right = $jobs[$rightIndex];
                $sharedResourceIds = $left->resources->pluck('id')
                    ->intersect($right->resources->pluck('id'))
                    ->sort()
                    ->values();

                if ($sharedResourceIds->isEmpty()) {
                    continue;
                }

                $overlaps = $this->intersectionSegments(
                    $this->weeklySegments($left),
                    $this->weeklySegments($right),
                );

                if ($overlaps === []) {
                    continue;
                }

                $presentedOverlaps = $this->presentOverlaps($overlaps);
                foreach ($sharedResourceIds as $resourceId) {
                    $conflicts[] = [
                        'resource_id' => $resourceId,
                        'job_a_id' => $left->id,
                        'job_b_id' => $right->id,
                        'overlaps' => $presentedOverlaps,
                    ];
                }
            }
        }

        return $conflicts;
    }

    /**
     * @param  Collection<int, ScheduleJob>  $jobs
     * @param  Collection<int, ScheduleResource>  $resources
     * @return list<array<string, int|float|null>>
     */
    public function utilization(Collection $jobs, Collection $resources, int|string $weekday = 'all'): array
    {
        return array_values($resources->map(function (ScheduleResource $resource) use ($jobs, $weekday): array {
            $segments = $jobs
                ->filter(fn (ScheduleJob $job): bool => $job->resources->contains('id', $resource->id))
                ->flatMap(fn (ScheduleJob $job): array => $this->weeklySegments($job))
                ->all();

            $minutesByWeekday = [];
            foreach (range(0, 6) as $day) {
                $dayStart = $day * self::MINUTES_PER_DAY;
                $dayEnd = $dayStart + self::MINUTES_PER_DAY;
                $daySegments = [];

                foreach ($segments as [$start, $end]) {
                    $intersectionStart = max($start, $dayStart);
                    $intersectionEnd = min($end, $dayEnd);
                    if ($intersectionStart < $intersectionEnd) {
                        $daySegments[] = [$intersectionStart, $intersectionEnd];
                    }
                }

                $minutesByWeekday[$day] = $this->segmentMinutes($this->unionSegments($daySegments));
            }

            if ($weekday === 'all') {
                $occupiedMinutes = -1;
                $busiestWeekday = 0;
                foreach ($minutesByWeekday as $day => $minutes) {
                    if ($minutes > $occupiedMinutes) {
                        $occupiedMinutes = $minutes;
                        $busiestWeekday = $day;
                    }
                }
                $selectedWeekday = null;
            } else {
                $selectedWeekday = (int) $weekday;
                $busiestWeekday = null;
                $occupiedMinutes = $minutesByWeekday[$selectedWeekday];
            }

            return [
                'resource_id' => $resource->id,
                'selected_weekday' => $selectedWeekday,
                'busiest_weekday' => $busiestWeekday,
                'occupied_minutes' => $occupiedMinutes,
                'utilization' => round($occupiedMinutes / self::MINUTES_PER_DAY, 4),
            ];
        })->all());
    }

    /**
     * Project a recurring job onto a circular Monday-through-Sunday week.
     *
     * @return list<array{0: int, 1: int}>
     */
    private function weeklySegments(ScheduleJob $job): array
    {
        [$hour, $minute] = array_map('intval', explode(':', $job->start_time));
        $startMinute = ($hour * 60) + $minute;
        $segments = [];

        foreach ($job->weekdays as $weekday) {
            $cursor = ((int) $weekday * self::MINUTES_PER_DAY) + $startMinute;
            $remaining = $job->duration_minutes;

            while ($remaining > 0) {
                $weekCursor = $cursor % self::MINUTES_PER_WEEK;
                $segmentLength = min($remaining, self::MINUTES_PER_WEEK - $weekCursor);
                $segments[] = [$weekCursor, $weekCursor + $segmentLength];
                $cursor += $segmentLength;
                $remaining -= $segmentLength;
            }
        }

        return $this->unionSegments($segments);
    }

    /**
     * @param  list<array{0: int, 1: int}>  $left
     * @param  list<array{0: int, 1: int}>  $right
     * @return list<array{0: int, 1: int}>
     */
    private function intersectionSegments(array $left, array $right): array
    {
        $intersections = [];
        foreach ($left as [$leftStart, $leftEnd]) {
            foreach ($right as [$rightStart, $rightEnd]) {
                $start = max($leftStart, $rightStart);
                $end = min($leftEnd, $rightEnd);
                if ($start < $end) {
                    $intersections[] = [$start, $end];
                }
            }
        }

        return $this->unionSegments($intersections);
    }

    /**
     * @param  list<array{0: int, 1: int}>  $segments
     * @return list<array{0: int, 1: int}>
     */
    private function unionSegments(array $segments): array
    {
        usort($segments, fn (array $left, array $right): int => $left[0] <=> $right[0]);
        $union = [];

        foreach ($segments as [$start, $end]) {
            $lastIndex = count($union) - 1;
            if ($lastIndex < 0 || $start > $union[$lastIndex][1]) {
                $union[] = [$start, $end];
            } else {
                $union[$lastIndex][1] = max($union[$lastIndex][1], $end);
            }
        }

        return $union;
    }

    /**
     * @param  list<array{0: int, 1: int}>  $segments
     * @return list<array{weekday: int, start_minute: int, end_minute: int}>
     */
    private function presentOverlaps(array $segments): array
    {
        $overlaps = [];
        foreach ($segments as [$start, $end]) {
            $cursor = $start;
            while ($cursor < $end) {
                $weekday = intdiv($cursor, self::MINUTES_PER_DAY);
                $dayEnd = ($weekday + 1) * self::MINUTES_PER_DAY;
                $segmentEnd = min($end, $dayEnd);
                $overlaps[] = [
                    'weekday' => $weekday,
                    'start_minute' => $cursor % self::MINUTES_PER_DAY,
                    'end_minute' => $segmentEnd - ($weekday * self::MINUTES_PER_DAY),
                ];
                $cursor = $segmentEnd;
            }
        }

        return $overlaps;
    }

    /** @param list<array{0: int, 1: int}> $segments */
    private function segmentMinutes(array $segments): int
    {
        return array_sum(array_map(
            static fn (array $segment): int => $segment[1] - $segment[0],
            $segments,
        ));
    }
}
