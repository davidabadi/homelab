<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Enums\YamtrackImportStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\StoreYamtrackImportRequest;
use App\Jobs\ProcessYamtrackImport;
use App\Models\User;
use App\Models\YamtrackImport;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class YamtrackImportController extends Controller
{
    public function index(Request $request): Response
    {
        $import = $request->user()->yamtrackImports()->latest()->first();

        return $this->page($import);
    }

    public function show(Request $request, YamtrackImport $yamtrackImport): Response
    {
        abort_unless($yamtrackImport->user_id === $request->user()->id, 404);

        return $this->page($yamtrackImport);
    }

    public function store(StoreYamtrackImportRequest $request): RedirectResponse
    {
        $file = $request->file('file');
        if ($file === null) {
            throw ValidationException::withMessages(['file' => 'Choose a CSV file.']);
        }

        $storedPath = null;
        try {
            $import = DB::transaction(function () use ($request, $file, &$storedPath): YamtrackImport {
                /** @var User $user */
                $user = User::query()->lockForUpdate()->findOrFail($request->user()->id);
                if (YamtrackImport::query()->where('active_user_id', $user->id)->exists()) {
                    throw ValidationException::withMessages([
                        'file' => 'Wait for your current Yamtrack import to finish before starting another.',
                    ]);
                }

                $storedPath = $file->storeAs('yamtrack-imports', Str::uuid().'.csv', 'local');
                if (! is_string($storedPath)) {
                    throw ValidationException::withMessages(['file' => 'The CSV could not be stored.']);
                }

                return $user->yamtrackImports()->create([
                    'active_user_id' => $user->id,
                    'strategy' => $request->strategy(),
                    'status' => YamtrackImportStatus::Pending,
                    'original_filename' => Str::limit(basename($file->getClientOriginalName()), 255, ''),
                    'stored_path' => $storedPath,
                    'file_hash' => hash_file('sha256', Storage::disk('local')->path($storedPath)),
                ]);
            });
        } catch (Throwable $exception) {
            if (is_string($storedPath)) {
                Storage::disk('local')->delete($storedPath);
            }
            throw $exception;
        }

        ProcessYamtrackImport::dispatch($import->id);

        return to_route('yamtrack-import.show', $import);
    }

    private function page(?YamtrackImport $import): Response
    {
        return Inertia::render('settings/import', [
            'importRun' => $import === null ? null : [
                'id' => $import->id,
                'strategy' => $import->strategy->value,
                'status' => $import->status->value,
                'original_filename' => $import->original_filename,
                'total_rows' => $import->total_rows,
                'processed_rows' => $import->processed_rows,
                'successful_rows' => $import->successful_rows,
                'skipped_rows' => $import->skipped_rows,
                'failed_rows' => $import->failed_rows,
                'shows_added' => $import->shows_added,
                'shows_removed' => $import->shows_removed,
                'episodes_marked_watched' => $import->episodes_marked_watched,
                'episodes_reset' => $import->episodes_reset,
                'movies_added' => $import->movies_added,
                'movies_removed' => $import->movies_removed,
                'movies_marked_watched' => $import->movies_marked_watched,
                'movies_reset' => $import->movies_reset,
                'started_at' => $import->started_at?->toIso8601String(),
                'completed_at' => $import->completed_at?->toIso8601String(),
                'failure_message' => $import->failure_message,
                'error_summary' => $import->error_summary ?? [],
            ],
        ]);
    }
}
