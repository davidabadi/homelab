<?php

use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Settings\SecurityController;
use App\Http\Controllers\Settings\TimezoneController;
use App\Http\Controllers\Settings\YamtrackImportController;
use Illuminate\Auth\Middleware\RequirePassword;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->group(function () {
    Route::redirect('settings', '/settings/profile');

    Route::get('settings/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('settings/profile', [ProfileController::class, 'update'])->name('profile.update');

    Route::get('settings/import', [YamtrackImportController::class, 'index'])->name('yamtrack-import.index');
    Route::post('settings/import', [YamtrackImportController::class, 'store'])->name('yamtrack-import.store');
    Route::get('settings/import/{yamtrackImport}', [YamtrackImportController::class, 'show'])->name('yamtrack-import.show');

    // Silent background sync of the user's browser-detected timezone; drives the
    // calendar-day cutoff for their Upcoming feed and Watch List.
    Route::patch('settings/timezone', [TimezoneController::class, 'update'])->name('timezone.update');
});

Route::middleware(['auth', 'verified'])->group(function () {
    Route::delete('settings/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::get('settings/security', [SecurityController::class, 'edit'])
        ->middleware(RequirePassword::class)
        ->name('security.edit');

    Route::put('settings/password', [SecurityController::class, 'update'])
        ->middleware('throttle:6,1')
        ->name('user-password.update');

    Route::inertia('settings/appearance', 'settings/appearance')->name('appearance.edit');
});

Route::get('.well-known/passkey-endpoints', function () {
    return response()->json([
        'enroll' => route('security.edit'),
        'manage' => route('security.edit'),
    ]);
})->name('well-known.passkeys');
