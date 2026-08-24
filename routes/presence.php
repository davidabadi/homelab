<?php

use Illuminate\Support\Facades\Route;

Route::inertia('/', 'presence/index')
    ->middleware(['auth', 'verified'])
    ->name('presence.home');
