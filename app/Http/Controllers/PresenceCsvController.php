<?php

namespace App\Http\Controllers;

use App\Enums\PresenceTripStatus;
use App\Http\Requests\ExportPresenceCsvRequest;
use App\Http\Requests\ImportPresenceCsvRequest;
use App\Http\Requests\PreviewPresenceCsvRequest;
use App\Services\Presence\PresenceCsvService;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PresenceCsvController extends Controller
{
    public function __construct(private readonly PresenceCsvService $csvService) {}

    public function preview(PreviewPresenceCsvRequest $request): JsonResponse
    {
        $preview = $this->csvService->preview($request->user(), $request->file('csv'), $request->mode());
        $request->session()->put($this->sessionKey($preview['preview_hash']), $request->user()->id);

        return response()->json($preview);
    }

    public function store(ImportPresenceCsvRequest $request): JsonResponse
    {
        $previewHash = $request->string('preview_hash')->toString();
        $expectedHash = $this->csvService->previewHash($request->file('csv'), $request->mode());
        $previewedUserId = $request->session()->pull($this->sessionKey($previewHash));

        if (! hash_equals($expectedHash, $previewHash) || $previewedUserId !== $request->user()->id) {
            throw ValidationException::withMessages([
                'csv' => 'Preview this exact file and import mode before importing.',
            ]);
        }

        $preview = $this->csvService->preview($request->user(), $request->file('csv'), $request->mode());

        if (! $preview['valid']) {
            throw ValidationException::withMessages([
                'csv' => 'Resolve every row error and preview the file again before importing.',
            ]);
        }

        $count = $this->csvService->import($request->user(), $preview['rows'], $request->mode());

        return response()->json(['imported' => true, 'mode' => $request->mode(), 'trip_count' => $count]);
    }

    public function export(ExportPresenceCsvRequest $request): StreamedResponse
    {
        $filename = 'us-presence-trips-'.now()->toDateString().'.csv';

        return response()->streamDownload(function () use ($request): void {
            $output = fopen('php://output', 'wb');

            if ($output === false) {
                return;
            }

            fputcsv($output, ['entry_date', 'exit_date', 'planned', 'notes'], ',', '"', '');

            $request->user()->presenceTrips()->oldest('entry_date')->each(function ($trip) use ($output): void {
                fputcsv($output, [
                    $trip->entry_date->toDateString(),
                    $trip->exit_date->toDateString(),
                    $trip->status === PresenceTripStatus::Planned ? 'true' : 'false',
                    $trip->notes,
                ], ',', '"', '');
            });

            fclose($output);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function sessionKey(string $previewHash): string
    {
        return "presence.csv_preview.{$previewHash}";
    }
}
