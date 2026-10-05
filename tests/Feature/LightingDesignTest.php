<?php

declare(strict_types=1);

use App\Models\LightingComponentDefinition;
use App\Models\LightingDesign;
use App\Models\LightingDesignComponent;
use App\Models\LightingDesignConnection;
use App\Models\LightingDesignDuct;
use App\Models\LightingDesignRail;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
});

it('loads the lighting list editor and catalog on the lighting host', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();

    $this->actingAs($user)->get('http://lighting.test/')
        ->assertOk()->assertInertia(fn (Assert $page) => $page->component('lighting/index'));
    $this->get(route('lighting.designs.edit', $design))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->component('lighting/editor')->where('designId', $design->id));
    $this->get(route('lighting.catalog'))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->component('lighting/catalog'));
});

it('requires authentication for the lighting page and API', function (): void {
    $this->get('http://lighting.test/')->assertRedirect('/login');
    $this->getJson(route('lighting.designs.index'))->assertUnauthorized();
    $this->postJson(route('lighting.designs.store'), ['name' => 'Private panel'])->assertUnauthorized();
});

it('creates lists renames and deletes private designs with physical defaults', function (): void {
    $user = User::factory()->create();
    $created = $this->actingAs($user)->postJson(route('lighting.designs.store'), ['name' => 'Main panel'])
        ->assertCreated()->assertJsonPath('design.name', 'Main panel')
        ->assertJsonPath('design.width_mm', 364)->assertJsonPath('design.height_mm', 320)
        ->assertJsonPath('design.rails_count', 2)
        ->assertJsonPath('design.grid_size_mm', 5)->assertJsonPath('design.snap_to_grid', true);
    $design = LightingDesign::query()->findOrFail($created->json('design.id'));

    expect($design->user_id)->toBe($user->id);
    $this->getJson(route('lighting.designs.index'))->assertOk()
        ->assertJsonCount(1, 'designs')->assertJsonPath('designs.0.components_count', 0);
    $this->patchJson(route('lighting.designs.update', $design), ['name' => 'Main panel v2'])
        ->assertOk()->assertJsonPath('design.name', 'Main panel v2')->assertJsonPath('design.save_version', 1);
    $this->getJson(route('lighting.designs.show', $design))
        ->assertOk()->assertJsonPath('design.name', 'Main panel v2')->assertJsonCount(0, 'components');
    $this->deleteJson(route('lighting.designs.destroy', $design))->assertNoContent();

    $this->assertModelMissing($design);
});

it('validates design dimensions and usable enclosure margins', function (): void {
    $this->actingAs(User::factory()->create())->postJson(route('lighting.designs.store'), [
        'name' => 'Invalid', 'width_mm' => 0, 'height_mm' => -1, 'grid_size_mm' => 0,
    ])->assertUnprocessable()->assertJsonValidationErrors(['width_mm', 'height_mm', 'grid_size_mm']);
    $this->postJson(route('lighting.designs.store'), [
        'name' => 'No usable area', 'width_mm' => 100, 'margin_left_mm' => 50, 'margin_right_mm' => 50,
    ])->assertUnprocessable()->assertJsonValidationErrors(['margin_left_mm']);

    expect(LightingDesign::query()->count())->toBe(0);
});

it('isolates lighting designs and every write from other users', function (): void {
    $owner = User::factory()->create();
    $design = LightingDesign::factory()->for($owner)->create();
    $other = User::factory()->create();

    $this->actingAs($other)->getJson(route('lighting.designs.index'))->assertOk()->assertJsonCount(0, 'designs');
    $this->getJson(route('lighting.designs.show', $design))->assertNotFound();
    $this->get(route('lighting.designs.edit', $design))->assertNotFound();
    $this->patchJson(route('lighting.designs.update', $design), ['name' => 'Stolen'])->assertNotFound();
    $this->postJson(route('lighting.designs.duplicate', $design))->assertNotFound();
    $this->deleteJson(route('lighting.designs.destroy', $design))->assertNotFound();

    expect($design->fresh()->name)->toBe($design->name);
    $this->assertModelExists($design);
});

it('deletes design children and retains their shared catalog definitions', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();
    $definition = LightingComponentDefinition::factory()->create();
    $rail = LightingDesignRail::factory()->for($design, 'design')->create();
    $duct = LightingDesignDuct::factory()->for($design, 'design')->create();
    $source = LightingDesignComponent::factory()->for($design, 'design')->for($definition, 'definition')->create(['rail_id' => $rail->id]);
    $target = LightingDesignComponent::factory()->for($design, 'design')->for($definition, 'definition')->create();
    $connection = LightingDesignConnection::factory()->for($design, 'design')->create([
        'source_component_id' => $source->id, 'target_component_id' => $target->id,
    ]);

    $this->actingAs($user)->deleteJson(route('lighting.designs.destroy', $design))->assertNoContent();

    foreach ([$design, $source, $target, $rail, $duct, $connection] as $model) {
        $this->assertModelMissing($model);
    }
    $this->assertModelExists($definition);
});

it('duplicates full layouts with independent objects and shared immutable catalog references', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(['name' => 'Shelly option', 'margin_left_mm' => 15, 'grid_size_mm' => 2.5]);
    $definition = LightingComponentDefinition::factory()->create();
    $rail = LightingDesignRail::factory()->for($design, 'design')->create();
    $duct = LightingDesignDuct::factory()->for($design, 'design')->create(['orientation' => 'vertical']);
    $source = LightingDesignComponent::factory()->for($design, 'design')->for($definition, 'definition')->create(['rail_id' => $rail->id, 'y_mm' => 72.5, 'custom_label' => 'Dimmer A']);
    $target = LightingDesignComponent::factory()->for($design, 'design')->for($definition, 'definition')->create(['x_mm' => 120]);
    LightingDesignConnection::factory()->for($design, 'design')->create([
        'source_component_id' => $source->id, 'target_component_id' => $target->id,
        'route_points' => [['x_mm' => 59, 'y_mm' => 72.5], ['x_mm' => 147, 'y_mm' => 72.5], ['x_mm' => 147, 'y_mm' => 50]],
    ]);

    $response = $this->actingAs($user)->postJson(route('lighting.designs.duplicate', $design))
        ->assertCreated()->assertJsonPath('design.name', 'Shelly option (copy)')
        ->assertJsonPath('design.components_count', 2)->assertJsonPath('design.connections_count', 1);
    $copy = LightingDesign::query()->findOrFail($response->json('design.id'));
    $copiedLayout = $this->getJson(route('lighting.designs.show', $copy))->assertOk()->json();

    expect($copy->margin_left_mm)->toBe(15.0);
    expect($copy->grid_size_mm)->toBe(2.5);
    expect($copiedLayout['components'][0]['component_definition_id'])->toBe($definition->id);
    expect($copiedLayout['components'][0]['portable_id'])->not->toBe($source->portable_id);
    expect($copiedLayout['components'][0]['rail_portable_id'])->toBe($copiedLayout['rails'][0]['portable_id']);
    expect($copiedLayout['connections'][0]['source_portable_id'])->toBe($copiedLayout['components'][0]['portable_id']);
    expect($copiedLayout['ducts'][0]['portable_id'])->not->toBe($duct->portable_id);

    $copiedLayout['components'][0]['x_mm'] = 200;
    $copiedLayout['connections'][0]['route_points'] = [
        ['x_mm' => 209, 'y_mm' => 72.5], ['x_mm' => 209, 'y_mm' => 50], ['x_mm' => 147, 'y_mm' => 50],
    ];
    $this->putJson(route('lighting.designs.layout.update', $copy), [
        'base_version' => $copy->save_version, 'mutation_id' => (string) Str::uuid(),
        'design' => Arr::only($copiedLayout['design'], LightingDesign::EDITABLE_FIELDS),
        ...Arr::only($copiedLayout, ['components', 'rails', 'ducts', 'connections']),
    ])->assertOk();

    expect($source->fresh()->x_mm)->toBe(50.0);
    expect($copy->components()->where('portable_id', $copiedLayout['components'][0]['portable_id'])->firstOrFail()->x_mm)->toBe(200.0);
});
