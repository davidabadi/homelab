<?php

use App\Http\Controllers\PresenceCsvController;
use App\Http\Controllers\PresenceDashboardController;
use App\Http\Controllers\PresencePlanningController;
use App\Http\Controllers\PresenceSummaryController;
use App\Http\Controllers\PresenceTripController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('/', PresenceDashboardController::class)->name('presence.home');

    Route::prefix('api')->name('presence.')->group(function () {
        Route::apiResource('trips', PresenceTripController::class)
            ->parameters(['trips' => 'presenceTrip']);
        Route::post('csv/preview', [PresenceCsvController::class, 'preview'])->name('csv.preview');
        Route::post('csv/import', [PresenceCsvController::class, 'store'])->name('csv.store');
        Route::get('csv/export', [PresenceCsvController::class, 'export'])->name('csv.export');
        Route::get('summary/{year}', PresenceSummaryController::class)
            ->where('year', '[1-9][0-9]{3}')
            ->name('summary');
        Route::get('planning', [PresencePlanningController::class, 'show'])->name('planning.show');
        Route::put('planning/default', [PresencePlanningController::class, 'updateDefault'])
            ->name('planning.default.update');
        Route::put('planning/{year}', [PresencePlanningController::class, 'updateYear'])
            ->where('year', '[1-9][0-9]{3}')
            ->name('planning.year.update');
    });
});
