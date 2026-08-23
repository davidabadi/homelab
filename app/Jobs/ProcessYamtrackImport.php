<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Enums\YamtrackImportStatus;
use App\Models\YamtrackImport;
use App\Services\Importing\YamtrackImportService;
use DomainException;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use Throwable;

class ProcessYamtrackImport implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 1800;

    public bool $failOnTimeout = true;

    /** @var list<int> */
    public array $backoff = [60, 300];

    public function __construct(public readonly int $yamtrackImportId) {}

    public function uniqueId(): string
    {
        return (string) $this->yamtrackImportId;
    }

    public function handle(YamtrackImportService $service): void
    {
        $import = YamtrackImport::query()->findOrFail($this->yamtrackImportId);
        if (! $import->status->isActive()) {
            return;
        }

        $import->update([
            'status' => YamtrackImportStatus::Processing,
            'started_at' => $import->started_at ?? now(),
            'failure_message' => null,
        ]);

        try {
            $service->process($import);
        } catch (InvalidArgumentException|DomainException $exception) {
            $this->markFailed($import, $exception->getMessage());

            return;
        }

        $import->refresh();
        $import->update([
            'status' => ($import->skipped_rows + $import->failed_rows) > 0
                ? YamtrackImportStatus::CompletedWithErrors
                : YamtrackImportStatus::Completed,
            'active_user_id' => null,
            'completed_at' => now(),
        ]);
        Storage::disk('local')->delete($import->stored_path);
    }

    public function failed(?Throwable $exception): void
    {
        $import = YamtrackImport::query()->find($this->yamtrackImportId);
        if ($import !== null && $import->status->isActive()) {
            $this->markFailed($import, 'The import could not be completed. You can safely try again.');
        }
    }

    private function markFailed(YamtrackImport $import, string $message): void
    {
        $import->update([
            'status' => YamtrackImportStatus::Failed,
            'active_user_id' => null,
            'completed_at' => now(),
            'failure_message' => mb_substr($message, 0, 500),
        ]);
        Storage::disk('local')->delete($import->stored_path);
    }
}
