<?php

namespace App\Http\Controllers;

use App\Http\Requests\ExportLightingDesignRequest;
use App\Http\Requests\LightingDesignImportRequest;
use App\Services\Lighting\LightingDesignExporter;
use App\Services\Lighting\LightingDesignImporter;
use App\Services\Lighting\LightingDesignPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class LightingDesignInterchangeController extends Controller
{
    public function export(ExportLightingDesignRequest $request, int $design, LightingDesignExporter $exporter): Response
    {
        $document = $exporter->document($request->validated('layout'));
        $filename = (Str::slug($document['design']['name']) ?: 'lighting-design').'.lighting.json';

        return response(json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)."\n", 200, [
            'Content-Type' => 'application/json',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
            'Cache-Control' => 'no-store',
        ]);
    }

    public function preflight(LightingDesignImportRequest $request, LightingDesignImporter $importer): JsonResponse
    {
        return response()->json($importer->preflight($request->validated('document'), $request->validated('resolutions', [])));
    }

    public function store(LightingDesignImportRequest $request, LightingDesignImporter $importer, LightingDesignPresenter $presenter): JsonResponse
    {
        $design = $importer->import($request->user(), $request->validated('document'), $request->validated('name'), $request->validated('resolutions', []));

        return response()->json(['design' => $presenter->design($design)], 201);
    }
}
