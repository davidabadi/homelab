import { router, usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import { update as updateTimezone } from '@/actions/App/Http/Controllers/Settings/TimezoneController';
import type { Auth } from '@/types';

/**
 * Keeps the server's record of the user's timezone in step with their browser.
 *
 * The Upcoming feed and Watch List group dates by the user's own calendar day,
 * computed server-side from this stored value — so a stale or missing timezone
 * makes tomorrow's episode read as "Today" for viewers west of UTC in the
 * evening (their clock is already past midnight UTC).
 *
 * Fires only when the browser's detected IANA zone differs from the stored one —
 * normally never after the first load on a device — and rides the current page's
 * props refresh so the dates re-group in place.
 */
export function useTimezoneSync(): void {
    const user = usePage<{ auth: Auth }>().props.auth?.user;
    const isAuthenticated = Boolean(user);
    const stored = user?.timezone ?? null;

    useEffect(() => {
        if (!isAuthenticated) {
            return;
        }

        const detected =
            Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;

        if (!detected || detected === stored) {
            return;
        }

        router.patch(
            updateTimezone.url(),
            { timezone: detected },
            { preserveScroll: true, preserveState: true },
        );
    }, [isAuthenticated, stored]);
}
