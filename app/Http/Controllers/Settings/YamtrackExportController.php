<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Services\Exporting\YamtrackCsvExporter;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class YamtrackExportController extends Controller
{
    public function __invoke(Request $request, YamtrackCsvExporter $exporter): StreamedResponse
    {
        $filename = 'tracker-yamtrack-export-'.now()->toDateString().'.csv';

        return response()->streamDownload(function () use ($request, $exporter): void {
            $stream = fopen('php://output', 'wb');

            if ($stream === false) {
                return;
            }

            try {
                $exporter->write($request->user(), $stream);
            } finally {
                fclose($stream);
            }
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}
