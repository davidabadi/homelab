<?php

use Illuminate\Support\Facades\Route;

Route::inertia('/', 'schedule/index')
    ->middleware(['auth', 'verified'])
    ->name('schedule.home');
