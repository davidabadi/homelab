<?php

declare(strict_types=1);

use App\Enums\YamtrackImportStatus;
use App\Enums\YamtrackImportStrategy;
use App\Jobs\ProcessYamtrackImport;
use App\Models\User;
use App\Models\YamtrackImport;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

function validYamtrackUpload(string $name = 'yamtrack.csv'): UploadedFile
{
    return UploadedFile::fake()->createWithContent(
        $name,
        "media_id,source,media_type\n603,tmdb,movie\n",
    );
}

it('requires authentication for the import page', function () {
    $this->get(route('yamtrack-import.index'))->assertRedirect(route('login'));
});

it('shows the import page to an authenticated user', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('yamtrack-import.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/import')
            ->where('importRun', null));
});

it('validates strategy replacement confirmation extension size and headers', function () {
    Storage::fake('local');
    $user = User::factory()->create();

    $this->actingAs($user)->post(route('yamtrack-import.store'), [
        'file' => validYamtrackUpload(),
    ])->assertSessionHasErrors('strategy');

    $this->actingAs($user)->post(route('yamtrack-import.store'), [
        'file' => validYamtrackUpload(),
        'strategy' => YamtrackImportStrategy::Replace->value,
    ])->assertSessionHasErrors('replace_confirmed');

    $this->actingAs($user)->post(route('yamtrack-import.store'), [
        'file' => validYamtrackUpload('yamtrack.txt'),
        'strategy' => YamtrackImportStrategy::AddMissing->value,
    ])->assertSessionHasErrors('file');

    $this->actingAs($user)->post(route('yamtrack-import.store'), [
        'file' => UploadedFile::fake()->create('large.csv', 20_481, 'text/csv'),
        'strategy' => YamtrackImportStrategy::AddMissing->value,
    ])->assertSessionHasErrors('file');

    $this->actingAs($user)->post(route('yamtrack-import.store'), [
        'file' => UploadedFile::fake()->createWithContent('bad.csv', "title,status\nNo id,Planning\n"),
        'strategy' => YamtrackImportStrategy::AddMissing->value,
    ])->assertSessionHasErrors('file');
});

it('stores a private upload creates a run and dispatches its queued job', function () {
    Storage::fake('local');
    Queue::fake();
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post(route('yamtrack-import.store'), [
        'file' => validYamtrackUpload(),
        'strategy' => YamtrackImportStrategy::AddMissing->value,
    ]);

    $response->assertSessionHasNoErrors();
    $import = YamtrackImport::sole();
    $response->assertRedirect(route('yamtrack-import.show', $import));
    expect($import->user_id)->toBe($user->id)
        ->and($import->status)->toBe(YamtrackImportStatus::Pending)
        ->and($import->file_hash)->toHaveLength(64);
    Storage::disk('local')->assertExists($import->stored_path);
    Queue::assertPushed(ProcessYamtrackImport::class, fn ($job) => $job->yamtrackImportId === $import->id);
});

it('does not expose another users import run', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();
    $import = YamtrackImport::factory()->for($owner)->create();

    $this->actingAs($other)
        ->get(route('yamtrack-import.show', $import))
        ->assertNotFound();
});

it('rejects a second import while one is active', function () {
    Storage::fake('local');
    $user = User::factory()->create();
    YamtrackImport::factory()->for($user)->create([
        'active_user_id' => $user->id,
        'status' => YamtrackImportStatus::Processing,
    ]);

    $this->actingAs($user)->post(route('yamtrack-import.store'), [
        'file' => validYamtrackUpload(),
        'strategy' => YamtrackImportStrategy::AddMissing->value,
    ])->assertSessionHasErrors('file');

    expect(YamtrackImport::count())->toBe(1);
});
