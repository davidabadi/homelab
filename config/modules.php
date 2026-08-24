<?php

$applicationHost = parse_url((string) env('APP_URL', 'http://localhost'), PHP_URL_HOST);

return [
    'hosts' => [
        'tv' => env('TV_HOST') ?: $applicationHost,
        'schedule' => env('SCHEDULE_HOST') ?: null,
        'presence' => env('PRESENCE_HOST') ?: null,
    ],

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
