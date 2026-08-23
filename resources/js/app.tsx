import { createInertiaApp } from '@inertiajs/react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import AuthLayout from '@/layouts/auth-layout';
import SettingsLayout from '@/layouts/settings/layout';
import TrackerLayout from '@/layouts/tracker-layout';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

// The four main nav destinations (spec §5) share the tracker shell: bottom
// tab bar on mobile, sidebar on desktop. Sub-pages (e.g. shows/upcoming) live
// in a directory named after their tab and get the same shell.
const trackerPages = ['shows', 'movies', 'search', 'profile'];
const isTrackerPage = (name: string) =>
    trackerPages.some((page) => name === page || name.startsWith(`${page}/`));

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    layout: (name) => {
        switch (true) {
            case name.startsWith('auth/'):
                return AuthLayout;
            case name.startsWith('settings/'):
                return [TrackerLayout, SettingsLayout];
            case isTrackerPage(name):
                return TrackerLayout;
            default:
                return TrackerLayout;
        }
    },
    strictMode: true,
    withApp(app) {
        return (
            <TooltipProvider delayDuration={0}>
                {app}
                <Toaster />
            </TooltipProvider>
        );
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();

// Register the PWA service worker. It's built by vite-plugin-pwa into
// public/build but served from the site root (see the /sw.js route) so its
// scope covers the whole app. Skipped in dev, where no build output exists.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.error('Service worker registration failed:', err);
        });
    });
}
