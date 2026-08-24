@php($module = array_search(request()->getHost(), config('modules.hosts'), true) ?: 'shared')
@php($branding = config("modules.branding.{$module}", config('modules.branding.shared')))
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" data-app-module="{{ $module }}" data-app-name="{{ $branding['name'] }}" @class(['dark' => ($appearance ?? 'system') == 'dark'])>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        {{-- Inline script to detect system dark mode preference and apply it immediately --}}
        <script>
            (function() {
                const appearance = '{{ $appearance ?? "system" }}';

                if (appearance === 'system') {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

                    if (prefersDark) {
                        document.documentElement.classList.add('dark');
                    }
                }
            })();
        </script>

        {{-- Inline style to set the HTML background color based on our theme in app.css --}}
        <style>
            html {
                background-color: oklch(1 0 0);
            }

            html.dark {
                background-color: oklch(0.145 0 0);
            }
        </style>

        @if ($module === 'tv')
            <link rel="icon" href="{{ $branding['icon'] }}" type="{{ $branding['icon_type'] }}" sizes="192x192">
        @else
            <link rel="icon" href="{{ $branding['icon'] }}" type="{{ $branding['icon_type'] }}">
        @endif

        @if ($module === 'tv')
            <link rel="apple-touch-icon" href="/icons/icon-192.png">
            {{-- TV Time PWA manifest (built by vite-plugin-pwa, served from the TV host root) --}}
            <link rel="manifest" href="/manifest.webmanifest">
        @endif
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
        <meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">

        @fonts

        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        <x-inertia::head>
            <title>{{ $branding['name'] }}</title>
        </x-inertia::head>
    </head>
    <body class="font-sans antialiased">
        <x-inertia::app />
    </body>
</html>
