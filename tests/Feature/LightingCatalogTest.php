<?php

declare(strict_types=1);

use App\Models\LightingComponentDefinition;
use App\Models\LightingDesign;
use App\Models\LightingDesignComponent;
use App\Models\User;
use Database\Seeders\LightingComponentCatalogSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Storage;

/** @return array<string, mixed> */
function lightingDefinitionPayload(): array
{
    return Arr::except(LightingComponentDefinition::factory()->raw(), ['catalog_family_id', 'revision', 'image_path', 'archived_at']);
}

it('shares the catalog globally while assigning immutable numbered revisions', function (): void {
    $user = User::factory()->create();
    $created = $this->actingAs($user)->postJson(route('lighting.definitions.store'), lightingDefinitionPayload())
        ->assertCreated()->assertJsonPath('definition.revision', 1);
    $id = $created->json('definition.id');
    $family = $created->json('definition.catalog_family_id');
    $original = LightingComponentDefinition::query()->findOrFail($id);
    $design = LightingDesign::factory()->for($user)->create();
    $placement = LightingDesignComponent::factory()->for($design, 'design')->for($original, 'definition')->create();
    $new = lightingDefinitionPayload();
    $new['width_mm'] = 72;
    $new['display_name'] = 'Revised device';

    $revision = $this->actingAs(User::factory()->create())->postJson(route('lighting.definitions.revisions.store', $id), $new)
        ->assertCreated()->assertJsonPath('definition.revision', 2)->assertJsonPath('definition.catalog_family_id', $family);
    $this->getJson(route('lighting.definitions.index'))->assertOk()
        ->assertJsonCount(1, 'definitions')->assertJsonPath('definitions.0.id', $revision->json('definition.id'));
    $this->postJson(route('lighting.definitions.revisions.store', $id), $new)
        ->assertCreated()->assertJsonPath('definition.revision', 3);

    expect($original->fresh()->width_mm)->toBe(36.0);
    expect($placement->fresh()->component_definition_id)->toBe($id);
    expect($placement->definition->width_mm)->toBe(36.0);
});

it('validates physical catalog dimensions terminal layouts and upload types', function (): void {
    $payload = lightingDefinitionPayload();
    $payload['width_mm'] = -1;
    $payload['terminals'][0]['key'] = 'spaces not valid';
    $payload['image_url'] = 'javascript:alert(1)';

    $this->actingAs(User::factory()->create())->postJson(route('lighting.definitions.store'), $payload)
        ->assertUnprocessable()->assertJsonValidationErrors(['width_mm', 'terminals.0.key', 'image_url']);

    $payload = lightingDefinitionPayload();
    $payload['terminals'][0]['x_mm'] = 100;
    $this->postJson(route('lighting.definitions.store'), $payload)
        ->assertUnprocessable()->assertJsonValidationErrors(['terminals.0']);
    expect(LightingComponentDefinition::query()->count())->toBe(0);
});

it('accepts multipart JSON and stores uploads with authenticated image serving', function (): void {
    Storage::fake('local');
    $user = User::factory()->create();
    $payload = lightingDefinitionPayload();
    $payload['terminals'] = json_encode($payload['terminals'], JSON_THROW_ON_ERROR);
    $payload['metadata'] = json_encode(['manual' => true], JSON_THROW_ON_ERROR);
    $payload['image'] = UploadedFile::fake()->image('device.png', 120, 200);
    $created = $this->actingAs($user)->post(route('lighting.definitions.store'), $payload)
        ->assertCreated()->assertJsonPath('definition.metadata.manual', true);
    $definition = LightingComponentDefinition::query()->findOrFail($created->json('definition.id'));

    Storage::disk('local')->assertExists($definition->image_path);
    $this->get($created->json('definition.local_image_url'))->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');

    $revision = $this->postJson(route('lighting.definitions.revisions.store', $definition), lightingDefinitionPayload())
        ->assertCreated();
    expect($revision->json('definition.image_path'))->toBe($definition->image_path);

    $removed = $this->postJson(route('lighting.definitions.revisions.store', $definition), [
        ...lightingDefinitionPayload(), 'remove_image' => true,
    ])->assertCreated()->assertJsonPath('definition.local_image_url', null);
    expect($definition->fresh()->image_path)->not->toBeNull();
    Storage::disk('local')->assertExists($definition->image_path);
});

it('archives catalog families without deleting definitions referenced by saved designs', function (): void {
    $user = User::factory()->create();
    $definition = LightingComponentDefinition::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();
    LightingDesignComponent::factory()->for($design, 'design')->for($definition, 'definition')->create();
    $this->actingAs($user)->postJson(route('lighting.definitions.revisions.store', $definition), lightingDefinitionPayload())->assertCreated();

    $this->deleteJson(route('lighting.definitions.destroy', $definition))->assertNoContent();
    $this->getJson(route('lighting.definitions.index'))->assertOk()->assertJsonCount(0, 'definitions');
    $this->getJson(route('lighting.designs.show', $design))->assertOk()
        ->assertJsonPath('definitions.0.id', $definition->id)->assertJsonCount(1, 'components');
    $this->postJson(route('lighting.definitions.revisions.store', $definition), lightingDefinitionPayload())->assertConflict();

    expect($definition->fresh()->archived_at)->not->toBeNull();
    expect(LightingComponentDefinition::query()->count())->toBe(2);
});

it('seeds seven realistic examples idempotently with explicit sample geometry metadata', function (): void {
    $this->seed(LightingComponentCatalogSeeder::class);
    $this->seed(LightingComponentCatalogSeeder::class);

    expect(LightingComponentDefinition::query()->count())->toBe(7);
    $dimmer = LightingComponentDefinition::query()->where('model', 'SPDM-002PE01EU')->firstOrFail();
    expect($dimmer->width_mm)->toBe(19.0);
    expect($dimmer->metadata['sample_terminal_positions'])->toBeTrue();
    expect(LightingComponentDefinition::query()->where('kind', 'rail')->count())->toBe(1);
    expect(LightingComponentDefinition::query()->where('kind', 'duct')->count())->toBe(1);
});

it('defaults nullable mounting anchors to the physical center and rejects sizes below precision', function (): void {
    $user = User::factory()->create();
    $payload = lightingDefinitionPayload();
    $payload['width_mm'] = 36.25;
    $payload['mounting_anchor_x_mm'] = null;
    $payload['mounting_anchor_y_mm'] = null;

    $created = $this->actingAs($user)->postJson(route('lighting.definitions.store'), $payload)
        ->assertCreated()->assertJsonPath('definition.mounting_anchor_x_mm', 18.13)
        ->assertJsonPath('definition.mounting_anchor_y_mm', 45);

    $definition = LightingComponentDefinition::query()->findOrFail($created->json('definition.id'));
    expect($definition->mounting_anchor_x_mm)->toBe(18.13);
    expect($definition->mounting_anchor_y_mm)->toBe(45.0);

    $payload['width_mm'] = 0.004;
    $this->postJson(route('lighting.definitions.store'), $payload)->assertUnprocessable()->assertJsonValidationErrors('width_mm');
    expect(LightingComponentDefinition::query()->count())->toBe(1);
});
