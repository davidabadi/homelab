<?php

namespace App\Http\Controllers;

use App\Http\Requests\ImportScheduleBoardRequest;
use App\Services\Schedule\ScheduleBoardImportService;
use Illuminate\Http\JsonResponse;

class ScheduleBoardImportController extends Controller
{
    public function store(
        ImportScheduleBoardRequest $request,
        ScheduleBoardImportService $importer,
    ): JsonResponse {
        $importer->import($request->user(), $request->board(), $request->mode());

        return response()->json([
            'imported' => true,
            'mode' => $request->mode(),
            'resource_count' => count($request->validated('resources')),
            'job_count' => count($request->validated('jobs')),
        ]);
    }
}
