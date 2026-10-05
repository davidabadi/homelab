<?php

declare(strict_types=1);

use App\Models\LightingComponentDefinition;
use App\Models\LightingDesign;
use App\Models\LightingDesignComponent;
use App\Models\LightingDesignRail;
use App\Models\User;
use App\Services\Lighting\LightingRowLayout;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

/** @return array<string, mixed> */
function lightingRowLayoutPayload(LightingDesign $design): array
{
    return [
        'structured' => true, 'base_version' => $design->save_version,
        'mutation_id' => (string) Str::uuid(), 'design' => Arr::only($design->toArray(), LightingDesign::EDITABLE_FIELDS),
        'rails' => [], 'components' => [], 'ducts' => [], 'connections' => [],
    ];
}

/** @return array<string, mixed> */
function lightingRowPayload(int $order): array
{
    return [
        'portable_id' => (string) Str::uuid(), 'component_definition_id' => null,
        'sort_order' => $order, 'x_mm' => 0, 'y_mm' => 0, 'length_mm' => 324, 'width_mm' => 35,
    ];
}

/** @return array<string, mixed> */
function lightingRowDevicePayload(LightingComponentDefinition $definition, ?string $rowId, int $order): array
{
    return [
        'portable_id' => (string) Str::uuid(), 'component_definition_id' => $definition->id,
        'rail_portable_id' => $rowId, 'sort_order' => $order,
        'x_mm' => 0, 'y_mm' => 0, 'rotation' => 0, 'custom_label' => null, 'notes' => null, 'metadata' => [],
    ];
}

it('creates two ordered DIN rows without asking for enclosure dimensions', function (): void {
    $user = User::factory()->create();

    $created = $this->actingAs($user)->postJson(route('lighting.designs.store'), ['name' => 'Main lighting'])
        ->assertCreated()->assertJsonPath('design.width_mm', 364)->assertJsonPath('design.height_mm', 320)
        ->assertJsonPath('design.rails_count', 2);
    $this->getJson(route('lighting.designs.show', $created->json('design.id')))
        ->assertOk()->assertJsonCount(2, 'rails')->assertJsonPath('rails.0.sort_order', 0)
        ->assertJsonPath('rails.1.sort_order', 1)->assertJsonPath('rails.0.x_mm', 20)
        ->assertJsonPath('rails.0.y_mm', 72.5)->assertJsonPath('rails.1.y_mm', 212.5)
        ->assertJsonPath('rails.0.length_mm', 324);
});

it('accepts explicit physical dimensions for existing API clients', function (): void {
    $user = User::factory()->create();

    $created = $this->actingAs($user)->postJson(route('lighting.designs.store'), [
        'name' => 'Custom enclosure', 'width_mm' => 600, 'height_mm' => 800,
        'margin_left_mm' => 15, 'margin_right_mm' => 25,
    ])->assertCreated()->assertJsonPath('design.width_mm', 600)->assertJsonPath('design.height_mm', 800);
    $this->getJson(route('lighting.designs.show', $created->json('design.id')))
        ->assertJsonPath('rails.0.length_mm', 560)->assertJsonPath('rails.0.x_mm', 15);
});

it('persists row and device order and derives upright physical positions', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(7), lightingRowPayload(2)];
    $payload['components'] = [
        lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 9),
        lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 3),
    ];
    $firstId = $payload['components'][0]['portable_id'];
    $secondId = $payload['components'][1]['portable_id'];
    $payload['components'][0]['rotation'] = 180;
    $payload['components'][0]['x_mm'] = 999;
    $payload['components'][0]['y_mm'] = -50;

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertOk()->assertJsonPath('save_version', 1);
    $restored = $this->getJson(route('lighting.designs.show', $design))->assertOk()
        ->assertJsonPath('rails.0.portable_id', $payload['rails'][1]['portable_id'])
        ->assertJsonPath('rails.1.sort_order', 1)->assertJsonPath('design.height_mm', 320)->json();
    $items = collect($restored['components'])->keyBy('portable_id');
    expect($items[$secondId]['sort_order'])->toBe(0);
    expect($items[$secondId]['x_mm'])->toBe(20);
    expect($items[$firstId]['sort_order'])->toBe(1);
    expect($items[$firstId]['x_mm'])->toBe(56);
    expect($items[$firstId]['y_mm'])->toBe(185);
    expect($items[$firstId]['rotation'])->toBe(0);
});

it('moves a device to another row without changing its identity or shared definition', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0), lightingRowPayload(1)];
    $payload['components'] = [
        lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 0),
        lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 1),
    ];
    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $placement = $design->components()->where('portable_id', $payload['components'][1]['portable_id'])->firstOrFail();
    $payload['components'][1]['rail_portable_id'] = $payload['rails'][1]['portable_id'];
    $payload['components'][1]['sort_order'] = 0;
    $payload['base_version'] = 1;
    $payload['mutation_id'] = (string) Str::uuid();

    $this->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $restored = $this->getJson(route('lighting.designs.show', $design))->assertOk()->json();
    $moved = collect($restored['components'])->firstWhere('portable_id', $placement->portable_id);
    expect($placement->fresh()->id)->toBe($placement->id);
    expect($moved['rail_portable_id'])->toBe($payload['rails'][1]['portable_id']);
    expect($moved['sort_order'])->toBe(0);
    expect($moved['x_mm'])->toBe(20);
    expect($moved['y_mm'])->toBe(185);
    expect($moved['component_definition_id'])->toBe($definition->id);
});

it('reorders existing devices and rows after reload rather than preserving database insertion order', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0), lightingRowPayload(1)];
    $payload['components'] = [
        lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 0),
        lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 1),
    ];
    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $payload['rails'][0]['sort_order'] = 1;
    $payload['rails'][1]['sort_order'] = 0;
    $payload['components'][0]['sort_order'] = 1;
    $payload['components'][1]['sort_order'] = 0;
    $payload['base_version'] = 1;
    $payload['mutation_id'] = (string) Str::uuid();

    $this->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $this->getJson(route('lighting.designs.show', $design))->assertOk()
        ->assertJsonPath('rails.0.portable_id', $payload['rails'][1]['portable_id'])
        ->assertJsonPath('components.0.portable_id', $payload['components'][1]['portable_id'])
        ->assertJsonPath('components.0.x_mm', 20)->assertJsonPath('components.1.x_mm', 56)
        ->assertJsonPath('components.0.y_mm', 185);
});

it('grows the enclosure for additional rows and allows removing the last empty row', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0), lightingRowPayload(1), lightingRowPayload(2)];

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $this->getJson(route('lighting.designs.show', $design))
        ->assertJsonPath('design.height_mm', 460)->assertJsonPath('rails.2.y_mm', 352.5);
    $payload['rails'] = [];
    $payload['base_version'] = 1;
    $payload['mutation_id'] = (string) Str::uuid();
    $this->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $this->getJson(route('lighting.designs.show', $design))
        ->assertJsonCount(0, 'rails')->assertJsonPath('design.height_mm', 180);
    expect($design->rails()->count())->toBe(0);
});

it('rejects deleting an occupied row by silently detaching its remaining devices', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0)];
    $payload['components'] = [lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 0)];
    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $payload['rails'] = [];
    $payload['components'][0]['rail_portable_id'] = null;
    $payload['base_version'] = 1;
    $payload['mutation_id'] = (string) Str::uuid();

    $this->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertUnprocessable()->assertJsonValidationErrors('rails')
        ->assertJsonPath('errors.rails.0', 'Only empty rows can be removed. Move or remove their devices first.');
    expect($design->rails()->count())->toBe(1);
    expect($design->components()->firstOrFail()->rail_id)->not->toBeNull();
    expect($design->fresh()->save_version)->toBe(1);
});

it('removes an occupied row when its devices move to a retained row in the same save', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0), lightingRowPayload(1)];
    $payload['components'] = [lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 0)];
    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $removed = $design->rails()->where('portable_id', $payload['rails'][0]['portable_id'])->firstOrFail();
    $payload['components'][0]['rail_portable_id'] = $payload['rails'][1]['portable_id'];
    $payload['rails'] = [$payload['rails'][1]];
    $payload['base_version'] = 1;
    $payload['mutation_id'] = (string) Str::uuid();

    $this->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $this->assertModelMissing($removed);
    $this->getJson(route('lighting.designs.show', $design))->assertJsonCount(1, 'rails')
        ->assertJsonCount(1, 'components')->assertJsonPath('components.0.y_mm', 45);
});

it('returns 422 for invalid row or device ordering without changing the layout', function (Closure $change, string $error): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0), lightingRowPayload(1)];
    $payload['components'] = [
        lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 0),
        lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 1),
    ];
    $change($payload);

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertUnprocessable()->assertJsonValidationErrors($error);
    expect($design->rails()->count())->toBe(0);
    expect($design->components()->count())->toBe(0);
    expect($design->fresh()->save_version)->toBe(0);
})->with([
    'negative row order' => [function (array &$payload): void {
        $payload['rails'][0]['sort_order'] = -1;
    }, 'rails.0.sort_order'],
    'duplicate row order' => [function (array &$payload): void {
        $payload['rails'][1]['sort_order'] = 0;
    }, 'rails.1.sort_order'],
    'negative item order' => [function (array &$payload): void {
        $payload['components'][0]['sort_order'] = -1;
    }, 'components.0.sort_order'],
    'duplicate item order' => [function (array &$payload): void {
        $payload['components'][1]['sort_order'] = 0;
    }, 'components.1.sort_order'],
]);

it('returns 422 with an actionable message when devices exceed row capacity', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $definition = LightingComponentDefinition::factory()->create(['width_mm' => 400]);
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0)];
    $payload['components'] = [lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 0)];

    $response = $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertUnprocessable()->assertJsonValidationErrors('rails.0.length_mm');
    expect($response->json('errors')['rails.0.length_mm'][0])
        ->toBe('The devices exceed this row’s usable width. Move a device to another row or increase the panel width.');
    expect($design->components()->count())->toBe(0);
});

it('keeps legacy unassigned equipment and ducts intact while normalizing DIN rows', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();
    $definition = LightingComponentDefinition::factory()->create(['mounting_type' => 'pcb']);
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0)];
    $payload['components'] = [lightingRowDevicePayload($definition, null, 0)];
    $payload['components'][0]['x_mm'] = 123.45;
    $payload['components'][0]['y_mm'] = 456.78;
    $payload['components'][0]['rotation'] = 90;
    $payload['ducts'] = [[
        'portable_id' => (string) Str::uuid(), 'component_definition_id' => null,
        'x_mm' => 20, 'y_mm' => 140, 'length_mm' => 400, 'width_mm' => 40, 'orientation' => 'horizontal',
    ]];

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $this->getJson(route('lighting.designs.show', $design))
        ->assertJsonPath('components.0.portable_id', $payload['components'][0]['portable_id'])
        ->assertJsonPath('components.0.x_mm', 123.45)->assertJsonPath('components.0.y_mm', 456.78)
        ->assertJsonPath('components.0.rotation', 90)->assertJsonPath('components.0.rail_portable_id', null)
        ->assertJsonPath('ducts.0.portable_id', $payload['ducts'][0]['portable_id'])
        ->assertJsonPath('ducts.0.y_mm', 140);
});

it('leaves clearance for tall devices with asymmetric DIN mounting anchors', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $definition = LightingComponentDefinition::factory()->create(['height_mm' => 200, 'mounting_anchor_y_mm' => 150]);
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0), lightingRowPayload(1)];
    $payload['components'] = [lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 0)];

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $this->getJson(route('lighting.designs.show', $design))->assertJsonPath('design.height_mm', 520)
        ->assertJsonPath('rails.0.y_mm', 172.5)->assertJsonPath('rails.1.y_mm', 412.5)
        ->assertJsonPath('components.0.y_mm', 40);
});

it('rejects non DIN devices attached to a row without corrupting the valid devices in that row', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $dinDefinition = LightingComponentDefinition::factory()->create();
    $pcbDefinition = LightingComponentDefinition::factory()->create(['mounting_type' => 'pcb']);
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0)];
    $payload['components'] = [
        lightingRowDevicePayload($dinDefinition, $payload['rails'][0]['portable_id'], 0),
        lightingRowDevicePayload($pcbDefinition, $payload['rails'][0]['portable_id'], 1),
    ];

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertUnprocessable()->assertJsonValidationErrors('components.1.rail_portable_id');
    expect($design->components()->count())->toBe(0);
    expect($design->fresh()->save_version)->toBe(0);
});

it('keeps existing connections anchored when devices move between rows', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0), lightingRowPayload(1)];
    $payload['components'] = [
        lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 0),
        lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 1),
    ];
    $payload['connections'] = [[
        'portable_id' => (string) Str::uuid(), 'source_portable_id' => $payload['components'][0]['portable_id'],
        'source_terminal' => 'L', 'target_portable_id' => $payload['components'][1]['portable_id'], 'target_terminal' => 'N',
        'cable_type' => 'Power', 'color' => '#2563eb', 'gauge' => '1.5 mm²', 'conductor_count' => 1,
        'route_points' => [['x_mm' => 9, 'y_mm' => 0], ['x_mm' => 27, 'y_mm' => 0]],
        'actual_length_mm' => 250, 'notes' => 'Existing wire',
    ]];
    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $payload['components'][1]['rail_portable_id'] = $payload['rails'][1]['portable_id'];
    $payload['components'][1]['sort_order'] = 0;
    $payload['base_version'] = 1;
    $payload['mutation_id'] = (string) Str::uuid();

    $this->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $this->getJson(route('lighting.designs.show', $design))
        ->assertJsonPath('connections.0.portable_id', $payload['connections'][0]['portable_id'])
        ->assertJsonPath('connections.0.route_points', [
            ['x_mm' => 29, 'y_mm' => 45], ['x_mm' => 38, 'y_mm' => 45],
            ['x_mm' => 38, 'y_mm' => 185], ['x_mm' => 47, 'y_mm' => 185],
        ])->assertJsonPath('connections.0.actual_length_mm', 250);
});

it('duplicates ordered rows devices and connections while sharing immutable catalog definitions', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0), lightingRowPayload(1), lightingRowPayload(2)];
    $payload['components'] = [
        lightingRowDevicePayload($definition, $payload['rails'][1]['portable_id'], 0),
        lightingRowDevicePayload($definition, $payload['rails'][1]['portable_id'], 1),
    ];
    $payload['connections'] = [[
        'portable_id' => (string) Str::uuid(), 'source_portable_id' => $payload['components'][0]['portable_id'],
        'source_terminal' => 'L', 'target_portable_id' => $payload['components'][1]['portable_id'], 'target_terminal' => 'N',
        'cable_type' => 'Power', 'color' => null, 'gauge' => null, 'conductor_count' => 1,
        'route_points' => [['x_mm' => 9, 'y_mm' => 0], ['x_mm' => 27, 'y_mm' => 0]],
        'actual_length_mm' => null, 'notes' => null,
    ]];
    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();

    $duplicate = $this->postJson(route('lighting.designs.duplicate', $design))->assertCreated()
        ->assertJsonPath('design.rails_count', 3)->assertJsonPath('design.components_count', 2)
        ->assertJsonPath('design.connections_count', 1);
    $copied = $this->getJson(route('lighting.designs.show', $duplicate->json('design.id')))->assertOk()->json();
    expect(array_column($copied['rails'], 'sort_order'))->toBe([0, 1, 2]);
    expect(array_column($copied['components'], 'sort_order'))->toBe([0, 1]);
    expect($copied['components'][0]['component_definition_id'])->toBe($definition->id);
    expect($copied['components'][0]['rail_portable_id'])->toBe($copied['rails'][1]['portable_id']);
    expect($copied['components'][0]['portable_id'])->not->toBe($payload['components'][0]['portable_id']);
    expect($copied['connections'][0]['source_portable_id'])->toBe($copied['components'][0]['portable_id']);
    expect($copied['connections'][0]['target_portable_id'])->toBe($copied['components'][1]['portable_id']);
    expect($design->rails()->count())->toBe(3);
});

it('preserves existing cable bends while updating a moved device terminal', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0), lightingRowPayload(1)];
    $payload['components'] = [
        lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 0),
        lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 1),
    ];
    $payload['connections'] = [[
        'portable_id' => (string) Str::uuid(), 'source_portable_id' => $payload['components'][0]['portable_id'],
        'source_terminal' => 'L', 'target_portable_id' => $payload['components'][1]['portable_id'], 'target_terminal' => 'N',
        'cable_type' => 'Power', 'color' => null, 'gauge' => null, 'conductor_count' => 1,
        'route_points' => [
            ['x_mm' => 29, 'y_mm' => 45], ['x_mm' => 29, 'y_mm' => 20], ['x_mm' => 100, 'y_mm' => 20],
            ['x_mm' => 100, 'y_mm' => 45], ['x_mm' => 83, 'y_mm' => 45],
        ], 'actual_length_mm' => null, 'notes' => null,
    ]];
    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $payload['components'][1]['rail_portable_id'] = $payload['rails'][1]['portable_id'];
    $payload['components'][1]['sort_order'] = 0;
    $payload['base_version'] = 1;
    $payload['mutation_id'] = (string) Str::uuid();

    $this->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $this->getJson(route('lighting.designs.show', $design))->assertJsonPath('connections.0.route_points', [
        ['x_mm' => 29, 'y_mm' => 45], ['x_mm' => 29, 'y_mm' => 20], ['x_mm' => 100, 'y_mm' => 20],
        ['x_mm' => 100, 'y_mm' => 185], ['x_mm' => 47, 'y_mm' => 185],
    ]);
});

it('keeps a legacy design unchanged on read and converts its attached geometry only on a structured save', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(['save_version' => 23]);
    $definition = LightingComponentDefinition::factory()->create();
    $rail = LightingDesignRail::factory()->for($design, 'design')->create(['y_mm' => 20]);
    $component = LightingDesignComponent::factory()->for($design, 'design')->for($definition, 'definition')
        ->create(['rail_id' => $rail->id, 'x_mm' => 145, 'y_mm' => -10.5]);
    $snapshot = $this->actingAs($user)->getJson(route('lighting.designs.show', $design))
        ->assertJsonPath('design.save_version', 23)->assertJsonPath('components.0.y_mm', -10.5)
        ->assertJsonPath('components.0.x_mm', 145)->json();
    $payload = [
        ...lightingRowLayoutPayload($design), ...Arr::only($snapshot, ['rails', 'components', 'ducts', 'connections']),
    ];

    $this->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk()->assertJsonPath('save_version', 24);
    $this->getJson(route('lighting.designs.show', $design))->assertJsonPath('components.0.x_mm', 0)
        ->assertJsonPath('components.0.y_mm', 25)->assertJsonPath('components.0.portable_id', $component->portable_id)
        ->assertJsonPath('rails.0.portable_id', $rail->portable_id);
});

it('returns 422 when automatic row growth would exceed the supported physical range', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create(LightingRowLayout::DESIGN_DEFAULTS);
    $definition = LightingComponentDefinition::factory()->create(['height_mm' => 1000000, 'mounting_anchor_y_mm' => 500000]);
    $payload = lightingRowLayoutPayload($design);
    $payload['rails'] = [lightingRowPayload(0), lightingRowPayload(1)];
    $payload['components'] = [lightingRowDevicePayload($definition, $payload['rails'][0]['portable_id'], 0)];

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertUnprocessable()->assertJsonValidationErrors('design.height_mm');
    expect($design->rails()->count())->toBe(0);
    expect($design->fresh()->save_version)->toBe(0);
});

it('backfills existing row and device order without rewriting physical geometry or portable identifiers', function (): void {
    $migration = require database_path('migrations/2026_10_04_210747_add_sort_order_to_lighting_rows_and_components.php');
    $migration->down();
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();
    $definition = LightingComponentDefinition::factory()->create();
    $bottom = LightingDesignRail::query()->create(Arr::except(LightingDesignRail::factory()->raw([
        'design_id' => $design->id, 'y_mm' => 210,
    ]), 'sort_order'));
    $top = LightingDesignRail::query()->create(Arr::except(LightingDesignRail::factory()->raw([
        'design_id' => $design->id, 'y_mm' => 70,
    ]), 'sort_order'));
    $right = LightingDesignComponent::query()->create(Arr::except(LightingDesignComponent::factory()->raw([
        'design_id' => $design->id, 'component_definition_id' => $definition->id, 'rail_id' => $top->id, 'x_mm' => 100, 'y_mm' => -10.5,
    ]), 'sort_order'));
    $left = LightingDesignComponent::query()->create(Arr::except(LightingDesignComponent::factory()->raw([
        'design_id' => $design->id, 'component_definition_id' => $definition->id, 'rail_id' => $top->id, 'x_mm' => 20,
    ]), 'sort_order'));

    $migration->up();
    expect($top->fresh()->sort_order)->toBe(0);
    expect($bottom->fresh()->sort_order)->toBe(1);
    expect($left->fresh()->sort_order)->toBe(0);
    expect($right->fresh()->sort_order)->toBe(1);
    expect($right->fresh()->x_mm)->toBe(100.0);
    expect($right->fresh()->y_mm)->toBe(-10.5);
    expect($right->fresh()->portable_id)->toBe($right->portable_id);
});
