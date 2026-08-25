<?php

declare(strict_types=1);

use Symfony\Component\Process\Process;

it('uses the app URL hostname as the default passkey relying party ID', function () {
    expect(config('fortify.passkeys.relying_party_id'))->toBe('tv.test')
        ->and(config('passkeys.relying_party_id'))->toBe('tv.test');
});

it('generates passkey origins for every configured module host', function () {
    expect(config('fortify.passkeys.allowed_origins'))
        ->toEqualCanonicalizing([
            'http://tv.test',
            'http://schedule.test',
            'http://presence.test',
        ])
        ->and(config('passkeys.allowed_origins'))
        ->toEqualCanonicalizing(config('fortify.passkeys.allowed_origins'))
        ->not->toContain('http://unrelated.test');
});

it('resolves production passkey configuration from explicit module hosts', function () {
    $configuration = passkeyConfiguration([
        'APP_URL' => 'https://tvtime.example.com',
        'TV_HOST' => 'tvtime.example.com',
        'SCHEDULE_HOST' => 'schedule.example.com',
        'PRESENCE_HOST' => 'presence.example.com',
        'PASSKEY_RP_ID' => 'example.com',
    ]);

    expect($configuration['relying_party_id'])->toBe('example.com')
        ->and($configuration['allowed_origins'])
        ->toEqualCanonicalizing([
            'https://tvtime.example.com',
            'https://schedule.example.com',
            'https://presence.example.com',
        ])
        ->not->toContain('https://unrelated.example.com');
});

it('ignores empty module hosts and deduplicates repeated origins', function () {
    $configuration = passkeyConfiguration([
        'APP_URL' => 'https://tvtime.example.com',
        'TV_HOST' => 'tvtime.example.com',
        'SCHEDULE_HOST' => '',
        'PRESENCE_HOST' => 'tvtime.example.com',
        'PASSKEY_RP_ID' => '',
    ]);

    expect($configuration['relying_party_id'])->toBe('tvtime.example.com')
        ->and($configuration['allowed_origins'])->toBe([
            'https://tvtime.example.com',
        ]);
});

it('retains a distinct app URL origin for local and legacy access', function () {
    $configuration = passkeyConfiguration([
        'APP_URL' => 'http://localhost:8080',
        'TV_HOST' => 'tv.localhost',
        'SCHEDULE_HOST' => '',
        'PRESENCE_HOST' => '',
        'PASSKEY_RP_ID' => '',
    ]);

    expect($configuration['allowed_origins'])->toEqualCanonicalizing([
        'http://tv.localhost',
        'http://localhost:8080',
    ]);
});

/**
 * @param  array<string, string>  $environment
 * @return array{relying_party_id: string, allowed_origins: list<string>}
 */
function passkeyConfiguration(array $environment): array
{
    $process = new Process(
        [
            PHP_BINARY,
            '-r',
            'require "vendor/autoload.php"; $app = require "bootstrap/app.php"; '
                .'$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap(); '
                .'echo json_encode(config("fortify.passkeys"), JSON_THROW_ON_ERROR);',
        ],
        base_path(),
        [
            'APP_ENV' => 'testing',
            'APP_RUNNING_IN_CONSOLE' => 'true',
            ...$environment,
        ],
    );

    $process->mustRun();

    /** @var array{relying_party_id: string, allowed_origins: list<string>} $configuration */
    $configuration = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);

    return $configuration;
}
