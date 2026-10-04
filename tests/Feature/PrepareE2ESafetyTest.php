<?php

it('refuses to reset a PostgreSQL database even in a test environment', function () {
    $originalConnection = config('database.default');
    config()->set('database.default', 'pgsql');

    try {
        $this->artisan('app:prepare-e2e')
            ->expectsOutputToContain('E2E preparation requires the isolated')
            ->assertFailed();
    } finally {
        config()->set('database.default', $originalConnection);
    }
});

it('refuses an inherited database URL before preparing browser fixtures', function () {
    config()->set('database.connections.sqlite.url', 'postgresql://example.invalid/homelab');

    $this->artisan('app:prepare-e2e')
        ->expectsOutputToContain('an empty DB_URL')
        ->assertFailed();
});

it('refuses to reset an unrelated SQLite database', function () {
    config()->set('database.connections.sqlite.database', ':memory:');

    $this->artisan('app:prepare-e2e')->assertFailed();
});
