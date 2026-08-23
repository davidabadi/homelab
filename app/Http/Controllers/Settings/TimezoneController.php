<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\TimezoneUpdateRequest;
use Illuminate\Http\RedirectResponse;

class TimezoneController extends Controller
{
    /**
     * Persist the user's browser-detected timezone. Called silently by the
     * client whenever the detected IANA zone differs from the stored one, so the
     * Upcoming feed and Watch List use the right calendar-day cutoff for the
     * user's actual location (see User::localToday).
     */
    public function update(TimezoneUpdateRequest $request): RedirectResponse
    {
        $request->user()->update($request->validated());

        return back();
    }
}
