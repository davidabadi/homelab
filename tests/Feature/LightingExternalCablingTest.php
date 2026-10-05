<?php

declare(strict_types=1);

use App\Models\LightingComponentDefinition;
use App\Models\LightingDesign;
use App\Models\LightingDesignExternalCable;
use App\Models\User;
use App\Services\Lighting\LightingCablingLayout;
use App\Services\Lighting\LightingDesignExporter;
use App\Services\Lighting\LightingDesignPresenter;
use App\Services\Lighting\LightingGeometry;
use App\Services\Lighting\LightingRowLayout;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

/** @return array{user: User, design: LightingDesign, definition: LightingComponentDefinition, layout: array<string, mixed>} */
function lightingCablingFixture(): array
{
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $definition = LightingComponentDefinition::factory()->create();
    $componentId = (string) Str::uuid();
    $entryId = (string) Str::uuid();
    $networkEntryId = (string) Str::uuid();
    $bundleId = (string) Str::uuid();
    $layout = [
        'base_version' => 0, 'mutation_id' => (string) Str::uuid(),
        'design' => Arr::only($design->toArray(), LightingDesign::EDITABLE_FIELDS),
        'rails' => [], 'ducts' => [], 'connections' => [],
        'components' => [[
            'portable_id' => $componentId, 'component_definition_id' => $definition->id,
            'sort_order' => 0, 'rail_portable_id' => null, 'x_mm' => 20, 'y_mm' => 45,
            'rotation' => 0, 'custom_label' => 'DIN supply', 'notes' => null, 'metadata' => [],
        ]],
        'cable_entries' => [
            ['portable_id' => $entryId, 'label' => 'Bottom left', 'side' => 'bottom', 'offset_mm' => 20, 'span_mm' => 40,
                'entry_type' => 'conduit', 'notes' => 'Distribution board', 'metadata' => ['opening' => 'A']],
            ['portable_id' => $networkEntryId, 'label' => 'Network rack', 'side' => 'left', 'offset_mm' => 80, 'span_mm' => 40,
                'entry_type' => 'cable_gland', 'notes' => null, 'metadata' => []],
        ],
        'cable_bundles' => [[
            'portable_id' => $bundleId, 'cable_entry_portable_id' => $entryId, 'name' => 'AC Feed',
            'external_location' => 'Electrical panel', 'cable_class' => 'line_voltage', 'direction' => 'incoming',
            'display_color' => '#f59e0b', 'planned_count' => 8, 'notes' => 'Shared trunk', 'metadata' => ['tray' => 'A'],
            'route_points' => [['x_mm' => 40, 'y_mm' => 320], ['x_mm' => 40, 'y_mm' => 220], ['x_mm' => 120, 'y_mm' => 220]],
        ]],
        'external_cables' => [
            ['portable_id' => (string) Str::uuid(), 'bundle_portable_id' => $bundleId, 'cable_entry_portable_id' => null,
                'label' => 'Supply feed', 'cable_type' => 'AC supply', 'gauge' => '2.5 mm²', 'conductor_count' => 3,
                'internal_component_portable_id' => $componentId, 'internal_terminal' => 'L', 'cable_class' => null, 'direction' => null,
                'branch_route_points' => [['x_mm' => 120, 'y_mm' => 220], ['x_mm' => 29, 'y_mm' => 220], ['x_mm' => 29, 'y_mm' => 45]],
                'notes' => 'Retain field cable', 'metadata' => ['circuit' => 'AC-1']],
            ['portable_id' => (string) Str::uuid(), 'bundle_portable_id' => $bundleId, 'cable_entry_portable_id' => null,
                'label' => 'Future circuit', 'cable_type' => 'Control', 'gauge' => null, 'conductor_count' => 4,
                'internal_component_portable_id' => null, 'internal_terminal' => null, 'branch_route_points' => [],
                'cable_class' => null, 'direction' => null, 'notes' => null, 'metadata' => []],
            ['portable_id' => (string) Str::uuid(), 'bundle_portable_id' => null, 'cable_entry_portable_id' => $networkEntryId,
                'label' => 'Ethernet', 'cable_type' => 'CAT6', 'gauge' => '23 AWG', 'conductor_count' => 8,
                'internal_component_portable_id' => $componentId, 'internal_terminal' => 'N', 'cable_class' => 'data', 'direction' => 'incoming',
                'branch_route_points' => [['x_mm' => 0, 'y_mm' => 100], ['x_mm' => 47, 'y_mm' => 100], ['x_mm' => 47, 'y_mm' => 45]],
                'notes' => null, 'metadata' => []],
        ],
    ];

    return compact('user', 'design', 'definition', 'layout');
}

it('persists external cabling with portable relationships unassigned inventory and summary counts', function (): void {
    $fixture = lightingCablingFixture();

    $this->actingAs($fixture['user'])->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])
        ->assertOk()->assertJsonPath('save_version', 1);
    $response = $this->getJson(route('lighting.designs.show', $fixture['design']))->assertOk()
        ->assertJsonPath('design.cable_entries_count', 2)->assertJsonPath('design.cable_bundles_count', 1)
        ->assertJsonPath('design.external_cables_count', 3)->assertJsonPath('design.unassigned_external_cables_count', 1)
        ->assertJsonPath('cable_bundles.0.planned_count', 8)->assertJsonPath('external_cables.1.internal_terminal', null);

    foreach (LightingCablingLayout::GROUPS as $group) {
        expect($response->json($group))->toEqual($fixture['layout'][$group]);
    }
    $entry = $fixture['design']->cableEntries()->where('portable_id', $fixture['layout']['cable_entries'][0]['portable_id'])->firstOrFail();
    $bundle = $fixture['design']->cableBundles()->firstOrFail();
    expect($bundle->entry->id)->toBe($entry->id);
    expect($bundle->cables()->count())->toBe(2);
    $this->assertDatabaseHas('lighting_design_external_cables', [
        'design_id' => $fixture['design']->id, 'label' => 'Ethernet', 'bundle_id' => null, 'cable_class' => 'data',
    ]);
    $this->getJson(route('lighting.designs.index'))->assertJsonPath('designs.0.unassigned_external_cables_count', 1);
});

it('allows distinct bundles to share an entry and retain planning information without any defined members', function (): void {
    $fixture = lightingCablingFixture();
    $fixture['layout']['cable_bundles'][] = [
        ...$fixture['layout']['cable_bundles'][0], 'portable_id' => (string) Str::uuid(),
        'name' => 'Keypads', 'cable_class' => 'low_voltage_control', 'planned_count' => 8,
    ];

    $this->actingAs($fixture['user'])->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])->assertOk();

    expect($fixture['design']->cableBundles()->count())->toBe(2);
    expect($fixture['design']->cableBundles()->where('name', 'Keypads')->firstOrFail()->cables()->count())->toBe(0);
    $this->getJson(route('lighting.designs.show', $fixture['design']))->assertJsonPath('cable_bundles.1.planned_count', 8)
        ->assertJsonPath('cable_bundles.1.cable_class', 'low_voltage_control');
});

it('updates entry and cable properties and removes a bundle with its explicitly removed members atomically', function (): void {
    $fixture = lightingCablingFixture();
    $this->actingAs($fixture['user'])->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])->assertOk();
    $fixture['layout']['base_version'] = 1;
    $fixture['layout']['mutation_id'] = (string) Str::uuid();
    $fixture['layout']['cable_entries'][1]['label'] = 'Rack uplink';
    $fixture['layout']['external_cables'] = [[...$fixture['layout']['external_cables'][2], 'gauge' => '24 AWG']];
    $fixture['layout']['cable_bundles'] = [];
    $fixture['layout']['cable_entries'] = [$fixture['layout']['cable_entries'][1]];

    $this->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])->assertOk();

    $this->getJson(route('lighting.designs.show', $fixture['design']))->assertJsonCount(1, 'cable_entries')
        ->assertJsonCount(0, 'cable_bundles')->assertJsonCount(1, 'external_cables')
        ->assertJsonPath('cable_entries.0.label', 'Rack uplink')->assertJsonPath('external_cables.0.gauge', '24 AWG');
});

it('returns 422 for invalid external cabling without persisting a partial graph', function (string $field, mixed $value, string $errorField): void {
    $fixture = lightingCablingFixture();
    Arr::set($fixture['layout'], $field, $value);

    $this->actingAs($fixture['user'])->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])
        ->assertUnprocessable()->assertJsonValidationErrors($errorField);

    expect($fixture['design']->fresh()->save_version)->toBe(0);
    expect($fixture['design']->cableEntries()->count())->toBe(0);
    expect($fixture['design']->externalCables()->count())->toBe(0);
})->with([
    'invalid side' => ['cable_entries.0.side', 'front', 'cable_entries.0.side'],
    'negative offset' => ['cable_entries.0.offset_mm', -1, 'cable_entries.0.offset_mm'],
    'span exceeds bottom width' => ['cable_entries.0.span_mm', 345, 'cable_entries.0.offset_mm'],
    'zero span' => ['cable_entries.0.span_mm', 0, 'cable_entries.0.span_mm'],
    'bundle entry outside document' => ['cable_bundles.0.cable_entry_portable_id', 'e2de1b01-ec04-49e9-a331-31c60f2f6aa8', 'cable_bundles.0.cable_entry_portable_id'],
    'bundle missing entry anchor' => ['cable_bundles.0.route_points.0.y_mm', 300, 'cable_bundles.0.route_points'],
    'invalid bundle class' => ['cable_bundles.0.cable_class', 'safe', 'cable_bundles.0.cable_class'],
    'invalid direction' => ['cable_bundles.0.direction', 'up', 'cable_bundles.0.direction'],
    'no origin' => ['external_cables.0.bundle_portable_id', null, 'external_cables.0.bundle_portable_id'],
    'two origins' => ['external_cables.0.cable_entry_portable_id', 'e2de1b01-ec04-49e9-a331-31c60f2f6aa8', 'external_cables.0.bundle_portable_id'],
    'unknown bundle' => ['external_cables.0.bundle_portable_id', 'e2de1b01-ec04-49e9-a331-31c60f2f6aa8', 'external_cables.0.bundle_portable_id'],
    'unknown component' => ['external_cables.0.internal_component_portable_id', 'e2de1b01-ec04-49e9-a331-31c60f2f6aa8', 'external_cables.0.internal_component_portable_id'],
    'unknown terminal' => ['external_cables.0.internal_terminal', 'NOPE', 'external_cables.0.internal_terminal'],
    'terminal without component' => ['external_cables.0.internal_component_portable_id', null, 'external_cables.0.internal_terminal'],
    'component without terminal' => ['external_cables.0.internal_terminal', null, 'external_cables.0.internal_terminal'],
    'assigned without route' => ['external_cables.0.branch_route_points', [], 'external_cables.0.branch_route_points'],
    'branch not at breakout' => ['external_cables.0.branch_route_points.0.x_mm', 130, 'external_cables.0.branch_route_points'],
    'branch not at terminal' => ['external_cables.0.branch_route_points.2.y_mm', 44, 'external_cables.0.branch_route_points'],
    'diagonal branch' => ['external_cables.0.branch_route_points.1.y_mm', 210, 'external_cables.0.branch_route_points'],
    'malformed point' => ['external_cables.0.branch_route_points.1', ['x_mm' => 20], 'external_cables.0.branch_route_points.1.y_mm'],
    'bundled class override' => ['external_cables.0.cable_class', 'data', 'external_cables.0.cable_class'],
    'standalone without class' => ['external_cables.2.cable_class', null, 'external_cables.2.cable_class'],
    'unplanned local database reference' => ['external_cables.0.bundle_id', 17, 'external_cables.0'],
]);

it('returns 422 when a cabling UUID collides with a different layout object type', function (): void {
    $fixture = lightingCablingFixture();
    $fixture['layout']['external_cables'][0]['portable_id'] = strtoupper($fixture['layout']['components'][0]['portable_id']);

    $this->actingAs($fixture['user'])->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])
        ->assertUnprocessable()->assertJsonValidationErrors('external_cables.0.portable_id');

    expect($fixture['design']->externalCables()->count())->toBe(0);
});

it('returns 422 when an entry is removed while a bundle or standalone cable still uses it', function (int $entryIndex, string $field): void {
    $fixture = lightingCablingFixture();
    $this->actingAs($fixture['user'])->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])->assertOk();
    $fixture['layout']['base_version'] = 1;
    $fixture['layout']['mutation_id'] = (string) Str::uuid();
    array_splice($fixture['layout']['cable_entries'], $entryIndex, 1);

    $this->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])
        ->assertUnprocessable()->assertJsonValidationErrors($field);

    expect($fixture['design']->cableEntries()->count())->toBe(2);
    expect($fixture['design']->fresh()->save_version)->toBe(1);
})->with(['bundle' => [0, 'cable_bundles.0.cable_entry_portable_id'], 'standalone' => [1, 'external_cables.2.cable_entry_portable_id']]);

it('retains field cables and clears both termination fields when their internal component is removed', function (): void {
    $fixture = lightingCablingFixture();
    $this->actingAs($fixture['user'])->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])->assertOk();
    $fixture['layout']['base_version'] = 1;
    $fixture['layout']['mutation_id'] = (string) Str::uuid();
    $fixture['layout']['components'] = [];

    $this->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])->assertOk();

    $this->getJson(route('lighting.designs.show', $fixture['design']))->assertJsonCount(3, 'external_cables')
        ->assertJsonPath('external_cables.0.internal_component_portable_id', null)->assertJsonPath('external_cables.0.internal_terminal', null)
        ->assertJsonPath('external_cables.0.branch_route_points', [])->assertJsonPath('design.unassigned_external_cables_count', 3);
    expect($fixture['design']->components()->count())->toBe(0);
    $this->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])->assertOk()->assertJsonPath('save_version', 2);
    $fixture['layout']['external_cables'][0]['label'] = 'Changed deletion retry';
    $this->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])->assertConflict();
});

it('retains field cabling when a component is deleted directly and cascades cabling when its design is deleted', function (): void {
    $fixture = lightingCablingFixture();
    $this->actingAs($fixture['user'])->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])->assertOk();
    $component = $fixture['design']->components()->firstOrFail();
    $entry = $fixture['design']->cableEntries()->firstOrFail();
    $bundle = $fixture['design']->cableBundles()->firstOrFail();
    $cable = $fixture['design']->externalCables()->firstOrFail();

    $component->delete();

    $this->assertModelExists($cable);
    expect($cable->fresh()->internal_component_id)->toBeNull();
    expect($cable->fresh()->internal_terminal)->toBeNull();
    expect($cable->fresh()->branch_route_points)->toBe([]);
    $this->deleteJson(route('lighting.designs.destroy', $fixture['design']))->assertNoContent();
    foreach ([$entry, $bundle, $cable] as $model) {
        $this->assertModelMissing($model);
    }
    $this->assertModelExists($fixture['definition']);
});

it('keeps bottom entries anchored as rows grow and reroutes branches when a DIN component moves', function (): void {
    $fixture = lightingCablingFixture();
    $rowId = (string) Str::uuid();
    $fixture['layout']['structured'] = true;
    $fixture['layout']['rails'] = [
        ['portable_id' => $rowId, 'component_definition_id' => null, 'sort_order' => 0, 'x_mm' => 20, 'y_mm' => 72.5, 'length_mm' => 324, 'width_mm' => 35],
        ['portable_id' => (string) Str::uuid(), 'component_definition_id' => null, 'sort_order' => 1, 'x_mm' => 20, 'y_mm' => 212.5, 'length_mm' => 324, 'width_mm' => 35],
    ];
    $fixture['layout']['components'][0]['rail_portable_id'] = $rowId;
    $this->actingAs($fixture['user'])->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])->assertOk();
    $fixture['layout']['base_version'] = 1;
    $fixture['layout']['mutation_id'] = (string) Str::uuid();
    $fixture['layout']['rails'][] = [...$fixture['layout']['rails'][1], 'portable_id' => (string) Str::uuid(), 'sort_order' => 2];
    $fixture['layout']['components'][0]['x_mm'] = 200;

    $this->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])->assertOk();

    $this->getJson(route('lighting.designs.show', $fixture['design']))->assertJsonPath('design.height_mm', 460)
        ->assertJsonPath('cable_entries.0.side', 'bottom')->assertJsonPath('cable_entries.0.offset_mm', 20)
        ->assertJsonPath('cable_bundles.0.route_points.0', ['x_mm' => 40, 'y_mm' => 460])
        ->assertJsonPath('cable_bundles.0.route_points.2', ['x_mm' => 120, 'y_mm' => 220])
        ->assertJsonPath('external_cables.0.branch_route_points', [
            ['x_mm' => 120, 'y_mm' => 220], ['x_mm' => 209, 'y_mm' => 220], ['x_mm' => 209, 'y_mm' => 45],
        ])->assertJsonPath('external_cables.2.branch_route_points.2', ['x_mm' => 227, 'y_mm' => 45]);
});

it('keeps cabling saves idempotent and rejects stale or reused mutations without overwriting routes', function (): void {
    $fixture = lightingCablingFixture();
    $route = route('lighting.designs.layout.update', $fixture['design']);
    $this->actingAs($fixture['user'])->putJson($route, $fixture['layout'])->assertOk()->assertJsonPath('save_version', 1);

    $this->putJson($route, $fixture['layout'])->assertOk()->assertJsonPath('save_version', 1);
    $fixture['layout']['external_cables'][0]['label'] = 'Changed feed';
    $this->putJson($route, $fixture['layout'])->assertConflict();
    $fixture['layout']['mutation_id'] = (string) Str::uuid();
    $this->putJson($route, $fixture['layout'])->assertConflict();

    $this->getJson(route('lighting.designs.show', $fixture['design']))->assertJsonPath('external_cables.0.label', 'Supply feed')
        ->assertJsonPath('cable_bundles.0.route_points', $fixture['layout']['cable_bundles'][0]['route_points']);
});

it('duplicates the complete external graph with fresh UUIDs remapped origins and shared catalog definitions', function (): void {
    $fixture = lightingCablingFixture();
    $this->actingAs($fixture['user'])->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])->assertOk();

    $copyId = $this->postJson(route('lighting.designs.duplicate', $fixture['design']))->assertCreated()
        ->assertJsonPath('design.external_cables_count', 3)->assertJsonPath('design.unassigned_external_cables_count', 1)->json('design.id');
    $copy = $this->getJson(route('lighting.designs.show', $copyId))->assertOk()->json();

    foreach (LightingCablingLayout::GROUPS as $group) {
        foreach ($copy[$group] as $index => $item) {
            expect($item['portable_id'])->not->toBe($fixture['layout'][$group][$index]['portable_id']);
        }
    }
    expect($copy['cable_bundles'][0]['cable_entry_portable_id'])->toBe($copy['cable_entries'][0]['portable_id']);
    expect($copy['external_cables'][0]['bundle_portable_id'])->toBe($copy['cable_bundles'][0]['portable_id']);
    expect($copy['external_cables'][0]['internal_component_portable_id'])->toBe($copy['components'][0]['portable_id']);
    expect($copy['external_cables'][2]['cable_entry_portable_id'])->toBe($copy['cable_entries'][1]['portable_id']);
    expect($copy['external_cables'][1]['internal_component_portable_id'])->toBeNull();
    expect($copy['components'][0]['component_definition_id'])->toBe($fixture['definition']->id);
    expect($copy['cable_bundles'][0]['route_points'])->toBe($fixture['layout']['cable_bundles'][0]['route_points']);
    expect($copy['external_cables'][0]['branch_route_points'])->toBe($fixture['layout']['external_cables'][0]['branch_route_points']);
});

it('round trips assigned unassigned and standalone external cables in schema v1 without exporting database relationships', function (): void {
    $fixture = lightingCablingFixture();
    $this->actingAs($fixture['user'])->putJson(route('lighting.designs.layout.update', $fixture['design']), $fixture['layout'])->assertOk();
    $snapshot = app(LightingDesignPresenter::class)->layout($fixture['design']);
    $layout = ['design' => Arr::only($snapshot['design'], LightingDesign::EDITABLE_FIELDS), ...Arr::only($snapshot, ['rails', 'components', 'ducts', 'connections', ...LightingCablingLayout::GROUPS])];
    $document = $this->postJson(route('lighting.designs.export', $fixture['design']), ['layout' => $layout])->assertOk()->json();
    expect($document['schema_version'])->toBe(1);
    foreach (LightingCablingLayout::GROUPS as $group) {
        foreach ($document[$group] as $item) {
            expect(array_keys($item))->not->toContain('id', 'design_id', 'bundle_id', 'cable_entry_id', 'internal_component_id');
        }
    }

    $copyId = $this->postJson(route('lighting.imports.store'), ['document' => $document, 'name' => 'Imported cabling', 'resolutions' => []])
        ->assertCreated()->assertJsonPath('design.external_cables_count', 3)->json('design.id');
    $copy = $this->getJson(route('lighting.designs.show', $copyId))->assertOk()->json();

    expect($copy['cable_entries'][0]['portable_id'])->not->toBe($document['cable_entries'][0]['portable_id']);
    expect($copy['cable_bundles'][0]['cable_entry_portable_id'])->toBe($copy['cable_entries'][0]['portable_id']);
    expect($copy['external_cables'][0]['internal_component_portable_id'])->toBe($copy['components'][0]['portable_id']);
    expect($copy['external_cables'][2]['cable_entry_portable_id'])->toBe($copy['cable_entries'][1]['portable_id']);
    expect($copy['cable_bundles'][0]['route_points'])->toBe($document['cable_bundles'][0]['route_points']);
    expect($copy['external_cables'][0]['branch_route_points'])->toBe($document['external_cables'][0]['branch_route_points']);
    expect($copy['external_cables'][0]['metadata'])->toBe(['circuit' => 'AC-1']);
    expect($copy['external_cables'][1]['internal_terminal'])->toBeNull();
    expect($copy['external_cables'][2]['cable_class'])->toBe('data');
});

it('returns 422 for invalid portable cabling references on import without creating a design', function (string $field, mixed $value, string $errorField): void {
    $fixture = lightingCablingFixture();
    $document = app(LightingDesignExporter::class)->document(Arr::except($fixture['layout'], ['base_version', 'mutation_id']));
    Arr::set($document, $field, $value);

    $this->actingAs($fixture['user'])->postJson(route('lighting.imports.store'), ['document' => $document, 'name' => 'Invalid import', 'resolutions' => []])
        ->assertUnprocessable()->assertJsonValidationErrors('document.'.$errorField);

    expect($fixture['user']->lightingDesigns()->count())->toBe(1);
    expect(LightingDesignExternalCable::query()->count())->toBe(0);
})->with([
    'foreign entry' => ['cable_bundles.0.cable_entry_portable_id', 'e2de1b01-ec04-49e9-a331-31c60f2f6aa8', 'cable_bundles.0.cable_entry_portable_id'],
    'foreign bundle' => ['external_cables.0.bundle_portable_id', 'e2de1b01-ec04-49e9-a331-31c60f2f6aa8', 'external_cables.0.bundle_portable_id'],
    'foreign component' => ['external_cables.0.internal_component_portable_id', 'e2de1b01-ec04-49e9-a331-31c60f2f6aa8', 'external_cables.0.internal_component_portable_id'],
    'unknown terminal' => ['external_cables.0.internal_terminal', 'NOPE', 'external_cables.0.internal_terminal'],
    'invalid breakout' => ['external_cables.0.branch_route_points.0.x_mm', 121, 'external_cables.0.branch_route_points'],
    'missing required cabling collection' => ['cable_entries', null, 'cable_entries'],
]);

it('resolves every enclosure edge from the opening midpoint and current dimensions', function (string $side, array $expected): void {
    expect(LightingGeometry::cableEntryPoint(['side' => $side, 'offset_mm' => 20, 'span_mm' => 40], ['width_mm' => 600, 'height_mm' => 800]))->toBe($expected);
})->with([
    'top' => ['top', ['x_mm' => 40.0, 'y_mm' => 0.0]],
    'right' => ['right', ['x_mm' => 600.0, 'y_mm' => 40.0]],
    'bottom' => ['bottom', ['x_mm' => 40.0, 'y_mm' => 800.0]],
    'left' => ['left', ['x_mm' => 0.0, 'y_mm' => 40.0]],
]);

it('clamps cable entries to the available edge span', function (string $side, float $offset, float $expected): void {
    expect(LightingGeometry::clampCableEntryOffset($side, $offset, 40, 364, 320))->toBe($expected);
})->with(['top far end' => ['top', 500.0, 324.0], 'right far end' => ['right', 500.0, 280.0], 'bottom negative' => ['bottom', -5.0, 0.0], 'left unchanged' => ['left', 120.25, 120.25]]);

it('calculates panel route lengths once for the shared trunk and includes it in each cable estimate', function (): void {
    $fixture = lightingCablingFixture();

    $trunk = LightingGeometry::routeLength($fixture['layout']['cable_bundles'][0]['route_points']);
    $branch = LightingGeometry::routeLength($fixture['layout']['external_cables'][0]['branch_route_points']);

    expect($trunk)->toBe(180.0);
    expect($branch)->toBe(266.0);
    expect($trunk + $branch)->toBe(446.0);
    expect(LightingGeometry::routeLength($fixture['layout']['external_cables'][2]['branch_route_points']))->toBe(102.0);
});
