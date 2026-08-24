@php($module = array_search(request()->getHost(), config('modules.hosts'), true) ?: 'shared')
@php($branding = config("modules.branding.{$module}", config('modules.branding.shared')))
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="icon" href="{{ $branding['icon'] }}" type="{{ $branding['icon_type'] }}">
        <title>{{ $branding['name'] }} - Not Found</title>
        @vite(['resources/css/app.css'])
    </head>
    <body class="bg-slate-950 text-slate-100 antialiased">
        <main class="flex min-h-svh items-center justify-center px-6">
            <div class="flex max-w-sm flex-col items-center gap-5 text-center">
                <img src="{{ $branding['icon'] }}" alt="{{ $branding['name'] }}" class="size-16 rounded-2xl">
                <div class="space-y-2">
                    <p class="text-sm font-semibold tracking-widest text-cyan-400 uppercase">404</p>
                    <h1 class="text-2xl font-semibold">Page not found</h1>
                </div>
            </div>
        </main>
    </body>
</html>
