<?php

use App\Http\Controllers\LightingComponentDefinitionController;
use App\Http\Controllers\LightingDesignController;
use App\Http\Controllers\LightingLayoutController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified'])->name('lighting.')->group(function (): void {
    Route::get('/', [LightingDesignController::class, 'home'])->name('home');
    Route::get('/designs/{design}', [LightingDesignController::class, 'edit'])->whereNumber('design')->name('designs.edit');
    Route::get('/catalog', [LightingComponentDefinitionController::class, 'catalog'])->name('catalog');

    Route::prefix('api')->group(function (): void {
        Route::get('/designs', [LightingDesignController::class, 'index'])->name('designs.index');
        Route::post('/designs', [LightingDesignController::class, 'store'])->name('designs.store');
        Route::get('/designs/{design}', [LightingDesignController::class, 'show'])->whereNumber('design')->name('designs.show');
        Route::patch('/designs/{design}', [LightingDesignController::class, 'update'])->whereNumber('design')->name('designs.update');
        Route::delete('/designs/{design}', [LightingDesignController::class, 'destroy'])->whereNumber('design')->name('designs.destroy');
        Route::post('/designs/{design}/duplicate', [LightingDesignController::class, 'duplicate'])->whereNumber('design')->name('designs.duplicate');
        Route::put('/designs/{design}/layout', [LightingLayoutController::class, 'update'])->whereNumber('design')->name('designs.layout.update');

        Route::get('/component-definitions', [LightingComponentDefinitionController::class, 'index'])->name('definitions.index');
        Route::post('/component-definitions', [LightingComponentDefinitionController::class, 'store'])->name('definitions.store');
        Route::post('/component-definitions/{definition}/revisions', [LightingComponentDefinitionController::class, 'revision'])->whereNumber('definition')->name('definitions.revisions.store');
        Route::delete('/component-definitions/{definition}', [LightingComponentDefinitionController::class, 'destroy'])->whereNumber('definition')->name('definitions.destroy');
        Route::get('/component-definitions/{definition}/image', [LightingComponentDefinitionController::class, 'image'])->whereNumber('definition')->name('definitions.image');
    });
});
