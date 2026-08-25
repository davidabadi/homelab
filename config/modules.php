<?php

$applicationUrl = (string) env('APP_URL', 'http://localhost');
$applicationScheme = parse_url($applicationUrl, PHP_URL_SCHEME) ?: 'http';
$applicationHost = parse_url($applicationUrl, PHP_URL_HOST);
$applicationPort = parse_url($applicationUrl, PHP_URL_PORT);

$hosts = [
    'tv' => env('TV_HOST') ?: $applicationHost,
    'schedule' => env('SCHEDULE_HOST') ?: null,
    'presence' => env('PRESENCE_HOST') ?: null,
];

$applicationOrigin = is_string($applicationHost) && $applicationHost !== ''
    ? $applicationScheme.'://'.$applicationHost.($applicationPort ? ":{$applicationPort}" : '')
    : null;

$origins = collect($hosts)
    ->filter(fn (mixed $host): bool => is_string($host) && $host !== '')
    ->map(fn (string $host): string => $applicationScheme.'://'.$host)
    ->when($applicationOrigin !== null, fn ($origins) => $origins->push($applicationOrigin))
    ->unique()
    ->values()
    ->all();

return [
    'hosts' => $hosts,

    'origins' => $origins,

    'branding' => [
        'tv' => [
            'name' => 'TV Time',
            'icon' => '/icons/icon-192.png',
            'icon_type' => 'image/png',
        ],
        'schedule' => [
            'name' => 'Schedule Board',
            'icon' => '/icons/schedule.svg',
            'icon_type' => 'image/svg+xml',
        ],
        'presence' => [
            'name' => 'US Presence',
            'icon' => '/icons/presence.svg',
            'icon_type' => 'image/svg+xml',
        ],
        'shared' => [
            'name' => config('app.name'),
            'icon' => '/icons/homelab.png',
            'icon_type' => 'image/png',
        ],
    ],
];
