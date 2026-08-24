<?php

declare(strict_types=1);

use App\Enums\PresenceTripStatus;
use App\Models\PresenceTrip;
use App\Models\User;
use App\Services\Presence\PresenceCsvService;
use Illuminate\Http\UploadedFile;

function presenceCsvUpload(string $contents): UploadedFile
{
    return UploadedFile::fake()->createWithContent('presence.csv', $contents);
}

it('requires authentication for preview import and export', function () {
    $csv = "entry_date,exit_date,planned,notes\n2026-01-01,2026-01-02,false,Test\n";

    $this->postJson(route('presence.csv.preview'), [
        'csv' => presenceCsvUpload($csv),
        'mode' => 'append',
    ])->assertUnauthorized();
    $this->postJson(route('presence.csv.store'), [
        'csv' => presenceCsvUpload($csv),
        'mode' => 'append',
        'preview_hash' => str_repeat('a', 64),
    ])->assertUnauthorized();
    $this->get(route('presence.csv.export'))->assertUnauthorized();
});

it('previews row validation duplicates and overlaps without writing data', function () {
    $user = User::factory()->create();
    $existing = PresenceTrip::factory()->for($user)->create([
        'entry_date' => '2026-01-01',
        'exit_date' => '2026-01-05',
        'status' => PresenceTripStatus::Confirmed,
    ]);
    $csv = <<<'CSV'
entry_date,exit_date,planned,notes
2026-01-04,2026-01-07,false,Confirmed overlap
2026-02-01,2026-02-03,true,Plan
2026-02-02,2026-02-04,true,Plan overlap
2026-02-01,2026-02-03,true,Duplicate
not-a-date,2026-03-02,false,Bad date
CSV;

    $this->actingAs($user)
        ->postJson(route('presence.csv.preview'), [
            'csv' => presenceCsvUpload($csv),
            'mode' => 'append',
        ])
        ->assertOk()
        ->assertJsonPath('valid', false)
        ->assertJsonPath('total_rows', 5)
        ->assertJsonPath('rows.0.errors.0', "Overlaps confirmed existing trip #{$existing->id}.")
        ->assertJsonPath('rows.2.warnings.0', 'Overlaps CSV row 3; projected totals will count shared days once.')
        ->assertJsonPath('rows.3.errors.0', 'Duplicates CSV row 3.')
        ->assertJsonPath('rows.4.errors.0', 'entry_date must be a real date in YYYY-MM-DD format.');

    expect($user->presenceTrips()->count())->toBe(1);
});

it('imports only the exact previewed file and mode', function () {
    $user = User::factory()->create();
    $csv = "entry_date,exit_date,planned,notes\n2026-04-01,2026-04-04,false,Spring trip\n2027-01-02,2027-01-05,true,Future plan\n";

    $previewHash = $this->actingAs($user)
        ->postJson(route('presence.csv.preview'), [
            'csv' => presenceCsvUpload($csv),
            'mode' => 'append',
        ])
        ->assertOk()
        ->assertJsonPath('valid', true)
        ->json('preview_hash');

    $this->actingAs($user)
        ->postJson(route('presence.csv.store'), [
            'csv' => presenceCsvUpload($csv),
            'mode' => 'replace',
            'preview_hash' => $previewHash,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('csv');

    $previewHash = $this->actingAs($user)
        ->postJson(route('presence.csv.preview'), [
            'csv' => presenceCsvUpload($csv),
            'mode' => 'append',
        ])
        ->assertOk()
        ->json('preview_hash');

    $this->actingAs($user)
        ->postJson(route('presence.csv.store'), [
            'csv' => presenceCsvUpload($csv),
            'mode' => 'append',
            'preview_hash' => $previewHash,
        ])
        ->assertOk()
        ->assertJson(['imported' => true, 'mode' => 'append', 'trip_count' => 2]);

    expect($user->presenceTrips()->count())->toBe(2)
        ->and($user->presenceTrips()->where('status', PresenceTripStatus::Planned)->count())->toBe(1);
});

it('replaces only the authenticated users trips', function () {
    $user = User::factory()->create();
    $otherUser = User::factory()->create();
    PresenceTrip::factory()->for($user)->create(['notes' => 'Remove me']);
    $otherTrip = PresenceTrip::factory()->for($otherUser)->create(['notes' => 'Keep me']);
    $csv = "entry_date,exit_date,planned,notes\n2026-05-01,2026-05-02,false,Replacement\n";

    $previewHash = $this->actingAs($user)
        ->postJson(route('presence.csv.preview'), [
            'csv' => presenceCsvUpload($csv),
            'mode' => 'replace',
        ])
        ->assertOk()
        ->json('preview_hash');

    $this->actingAs($user)
        ->postJson(route('presence.csv.store'), [
            'csv' => presenceCsvUpload($csv),
            'mode' => 'replace',
            'preview_hash' => $previewHash,
        ])
        ->assertOk();

    expect($user->presenceTrips()->sole()->notes)->toBe('Replacement')
        ->and($otherTrip->fresh()?->notes)->toBe('Keep me');
});

it('rolls back replace mode if any row fails while being stored', function () {
    $user = User::factory()->create();
    $existing = PresenceTrip::factory()->for($user)->create(['notes' => 'Original']);
    $rows = [
        [
            'row' => 2,
            'entry_date' => '2026-06-01',
            'exit_date' => '2026-06-02',
            'planned' => false,
            'status' => 'confirmed',
            'notes' => 'First',
            'errors' => [],
            'warnings' => [],
        ],
        [
            'row' => 3,
            'entry_date' => '2026-07-01',
            'exit_date' => '2026-07-02',
            'planned' => false,
            'status' => 'confirmed',
            'notes' => 'Trigger failure',
            'errors' => [],
            'warnings' => [],
        ],
    ];
    PresenceTrip::creating(function (PresenceTrip $trip): void {
        if ($trip->notes === 'Trigger failure') {
            throw new RuntimeException('Synthetic storage failure');
        }
    });

    expect(fn () => app(PresenceCsvService::class)->import($user, $rows, 'replace'))
        ->toThrow(RuntimeException::class);

    expect($existing->fresh()?->notes)->toBe('Original')
        ->and($user->presenceTrips()->count())->toBe(1);
});

it('exports a portable user-scoped CSV', function () {
    $user = User::factory()->create();
    $otherUser = User::factory()->create();
    PresenceTrip::factory()->for($user)->create([
        'entry_date' => '2026-08-01',
        'exit_date' => '2026-08-03',
        'status' => PresenceTripStatus::Planned,
        'notes' => 'Portable, with comma',
    ]);
    PresenceTrip::factory()->for($otherUser)->create(['notes' => 'Private']);

    $response = $this->actingAs($user)->get(route('presence.csv.export'));

    $response->assertOk()->assertDownload();
    expect($response->streamedContent())
        ->toContain('entry_date,exit_date,planned,notes')
        ->toContain('2026-08-01,2026-08-03,true,"Portable, with comma"')
        ->not->toContain('Private');
});
