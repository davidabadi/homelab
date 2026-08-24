<?php

namespace App\Services\Schedule;

use App\Models\ScheduleJob;
use App\Models\ScheduleResource;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ScheduleBoardImportService
{
    /**
     * @param array{
     *   resources: list<array{id: string, label: string, sub?: string|null}>,
     *   jobs: list<array{id: string, name: string, start: string, dur: int, days: list<int>, assigns: list<string>, notes?: string|null}>
     * } $board
     */
    public function import(User $user, array $board, string $mode): void
    {
        DB::transaction(function () use ($user, $board, $mode): void {
            User::query()->lockForUpdate()->findOrFail($user->id);

            if ($mode === 'replace') {
                $user->scheduleJobs()->delete();
                $user->scheduleResources()->delete();
            }

            $resourceIds = [];
            foreach ($board['resources'] as $resourceData) {
                $resource = ScheduleResource::query()->updateOrCreate(
                    ['user_id' => $user->id, 'portable_id' => $resourceData['id']],
                    ['label' => $resourceData['label'], 'subtitle' => $resourceData['sub'] ?? null],
                );
                $resourceIds[$resourceData['id']] = $resource->id;
            }

            foreach ($board['jobs'] as $jobData) {
                $weekdays = $jobData['days'];
                sort($weekdays);

                $job = ScheduleJob::query()->updateOrCreate(
                    ['user_id' => $user->id, 'portable_id' => $jobData['id']],
                    [
                        'name' => $jobData['name'],
                        'start_time' => $jobData['start'],
                        'duration_minutes' => $jobData['dur'],
                        'weekdays' => $weekdays,
                        'notes' => $jobData['notes'] ?? null,
                    ],
                );
                $job->resources()->sync(array_map(
                    static fn (string $portableId): int => $resourceIds[$portableId],
                    $jobData['assigns'],
                ));
            }
        });
    }
}
