<?php

use App\Http\Controllers\ScheduleBoardController;
use App\Http\Controllers\ScheduleBoardImportController;
use App\Http\Controllers\ScheduleJobController;
use App\Http\Controllers\ScheduleResourceController;
use Illuminate\Support\Facades\Route;

Route::get('/', [ScheduleBoardController::class, 'index'])
    ->middleware(['auth', 'verified'])
    ->name('schedule.home');

Route::prefix('api')->middleware(['auth', 'verified'])->group(function (): void {
    Route::get('/board', [ScheduleBoardController::class, 'show'])->name('schedule.board.show');
    Route::get('/export', [ScheduleBoardController::class, 'export'])->name('schedule.board.export');
    Route::post('/import', [ScheduleBoardImportController::class, 'store'])->name('schedule.board.import');

    Route::get('/resources', [ScheduleResourceController::class, 'index'])->name('schedule.resources.index');
    Route::post('/resources', [ScheduleResourceController::class, 'store'])->name('schedule.resources.store');
    Route::put('/resources/{resource}', [ScheduleResourceController::class, 'update'])->name('schedule.resources.update');
    Route::delete('/resources/{resource}', [ScheduleResourceController::class, 'destroy'])->name('schedule.resources.destroy');

    Route::get('/jobs', [ScheduleJobController::class, 'index'])->name('schedule.jobs.index');
    Route::post('/jobs', [ScheduleJobController::class, 'store'])->name('schedule.jobs.store');
    Route::put('/jobs/{job}', [ScheduleJobController::class, 'update'])->name('schedule.jobs.update');
    Route::delete('/jobs/{job}', [ScheduleJobController::class, 'destroy'])->name('schedule.jobs.destroy');
});
