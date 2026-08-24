<?php

$applicationHost = parse_url((string) env('APP_URL', 'http://localhost'), PHP_URL_HOST);

return [
    'hosts' => [
        'tv' => env('TV_HOST') ?: $applicationHost,
        'schedule' => env('SCHEDULE_HOST') ?: null,
        'presence' => env('PRESENCE_HOST') ?: null,
    ],
];
