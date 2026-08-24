<?php

namespace App\Http\Controllers;

use App\Models\ScheduleJob;
use App\Models\ScheduleResource;
use App\Services\Schedule\ScheduleCalculator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ScheduleBoardController extends Controller
{
    public function show(Request $request, ScheduleCalculator $calculator): JsonResponse
    {
        [$resources, $jobs] = $this->board($request);
        $weekday = $request->query('weekday', 'all');
        abort_unless($weekday === 'all' || in_array($weekday, ['0', '1', '2', '3', '4', '5', '6'], true), 422);

        return response()->json([
            ...$this->apiBoard($resources, $jobs),
            'conflicts' => $calculator->conflicts($jobs),
            'utilization' => $calculator->utilization($jobs, $resources, $weekday),
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        [$resources, $jobs] = $this->board($request);
        $board = $this->portableBoard($resources, $jobs);

        return response()->streamDownload(
            static fn () => print json_encode($board, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR),
            'homelab-schedule.json',
            ['Content-Type' => 'application/json'],
        );
    }

    /**
     * @return array{0: \Illuminate\Database\Eloquent\Collection<int, ScheduleResource>, 1: \Illuminate\Database\Eloquent\Collection<int, ScheduleJob>}
     */
    private function board(Request $request): array
    {
        $resources = $request->user()->scheduleResources()->orderBy('id')->get();
        $jobs = $request->user()->scheduleJobs()->with('resources:id,portable_id')->orderBy('id')->get();

        return [$resources, $jobs];
    }

    /**
     * @param  Collection<int, ScheduleResource>  $resources
     * @param  Collection<int, ScheduleJob>  $jobs
     * @return array{resources: list<array<string, mixed>>, jobs: list<array<string, mixed>>}
     */
    private function apiBoard($resources, $jobs): array
    {
        return [
            'resources' => array_values($resources->map(static fn (ScheduleResource $resource): array => [
                'id' => $resource->id,
                'label' => $resource->label,
                'subtitle' => $resource->subtitle,
            ])->all()),
            'jobs' => array_values($jobs->map(static fn (ScheduleJob $job): array => [
                'id' => $job->id,
                'name' => $job->name,
                'start_time' => mb_substr($job->start_time, 0, 5),
                'duration_minutes' => $job->duration_minutes,
                'weekdays' => $job->weekdays,
                'resources' => array_values($job->resources->map(
                    static fn (ScheduleResource $resource): int => $resource->id,
                )->all()),
                'notes' => $job->notes,
            ])->all()),
        ];
    }

    /**
     * @param  Collection<int, ScheduleResource>  $resources
     * @param  Collection<int, ScheduleJob>  $jobs
     * @return array{version: int, resources: list<array<string, mixed>>, jobs: list<array<string, mixed>>}
     */
    private function portableBoard($resources, $jobs): array
    {
        return [
            'version' => 3,
            'resources' => array_values($resources->map(static fn (ScheduleResource $resource): array => [
                'id' => $resource->portable_id,
                'label' => $resource->label,
                'sub' => $resource->subtitle ?? '',
            ])->all()),
            'jobs' => array_values($jobs->map(static fn (ScheduleJob $job): array => [
                'id' => $job->portable_id,
                'name' => $job->name,
                'start' => mb_substr($job->start_time, 0, 5),
                'dur' => $job->duration_minutes,
                'days' => $job->weekdays,
                'assigns' => array_values($job->resources->map(
                    static fn (ScheduleResource $resource): string => $resource->portable_id,
                )->all()),
                'notes' => $job->notes ?? '',
            ])->all()),
        ];
    }
}
