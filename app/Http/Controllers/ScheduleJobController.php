<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreScheduleJobRequest;
use App\Http\Requests\UpdateScheduleJobRequest;
use App\Models\ScheduleJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ScheduleJobController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $jobs = $request->user()->scheduleJobs()->with('resources:id')->orderBy('start_time')->get();

        return response()->json(['jobs' => $jobs->map($this->present(...))->values()]);
    }

    public function store(StoreScheduleJobRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $job = DB::transaction(function () use ($request, $validated): ScheduleJob {
            $job = $request->user()->scheduleJobs()->create([
                ...Arr::except($validated, 'resources'),
                'weekdays' => $this->sortedWeekdays($validated['weekdays']),
                'portable_id' => (string) Str::uuid(),
            ]);
            $job->resources()->sync($validated['resources']);

            return $job;
        });

        return response()->json(['job' => $this->present($job->load('resources:id'))], 201);
    }

    public function update(UpdateScheduleJobRequest $request, string $job): JsonResponse
    {
        $scheduleJob = $this->ownedJob($request, $job);
        $validated = $request->validated();

        DB::transaction(function () use ($scheduleJob, $validated): void {
            $scheduleJob->update([
                ...Arr::except($validated, 'resources'),
                'weekdays' => $this->sortedWeekdays($validated['weekdays']),
            ]);
            $scheduleJob->resources()->sync($validated['resources']);
        });

        return response()->json(['job' => $this->present($scheduleJob->load('resources:id'))]);
    }

    public function destroy(Request $request, string $job): Response
    {
        $this->ownedJob($request, $job)->delete();

        return response()->noContent();
    }

    private function ownedJob(Request $request, string $id): ScheduleJob
    {
        return $request->user()->scheduleJobs()->findOrFail($id);
    }

    /** @param list<int> $weekdays
     * @return list<int>
     */
    private function sortedWeekdays(array $weekdays): array
    {
        sort($weekdays);

        return $weekdays;
    }

    /** @return array<string, mixed> */
    private function present(ScheduleJob $job): array
    {
        return [
            'id' => $job->id,
            'name' => $job->name,
            'start_time' => mb_substr($job->start_time, 0, 5),
            'duration_minutes' => $job->duration_minutes,
            'weekdays' => $job->weekdays,
            'resources' => $job->resources->pluck('id')->values()->all(),
            'notes' => $job->notes,
        ];
    }
}
