<?php

declare(strict_types=1);

use App\Models\LightingComponentDefinition;
use App\Models\LightingDesign;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

/** @return array<string, mixed> */
function lightingLayoutPayload(LightingDesign $design): array
{
    return [
        'base_version' => $design->save_version, 'mutation_id' => (string) Str::uuid(),
        'design' => Arr::only($design->toArray(), LightingDesign::EDITABLE_FIELDS),
        'components' => [], 'rails' => [], 'ducts' => [], 'connections' => [],
        'cable_entries' => [], 'cable_bundles' => [], 'external_cables' => [],
    ];
}

/** @return array<string, mixed> */
function lightingPlacementPayload(LightingComponentDefinition $definition, ?string $id = null): array
{
    return [
        'portable_id' => $id ?? (string) Str::uuid(), 'component_definition_id' => $definition->id,
        'x_mm' => 37.12, 'y_mm' => 42.5, 'rotation' => 0, 'custom_label' => 'Dimmer',
        'rail_portable_id' => null, 'notes' => 'Physical placement', 'metadata' => ['channel' => 1],
    ];
}

it('persists exact millimeter placements and updates and deletes them through atomic saves', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingLayoutPayload($design);
    $payload['components'] = [lightingPlacementPayload($definition)];

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertOk()->assertJsonPath('save_version', 1)->assertJsonPath('mutation_id', $payload['mutation_id']);
    $this->getJson(route('lighting.designs.show', $design))
        ->assertOk()->assertJsonPath('components.0.x_mm', 37.12)->assertJsonPath('components.0.y_mm', 42.5)
        ->assertJsonPath('definitions.0.width_mm', 36)->assertJsonPath('design.components_count', 1);

    $payload['base_version'] = 1;
    $payload['mutation_id'] = (string) Str::uuid();
    $payload['components'][0]['x_mm'] = 80.25;
    $payload['components'][0]['custom_label'] = 'Dimmer changed';
    $this->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    expect($design->components()->firstOrFail()->x_mm)->toBe(80.25);

    $payload['base_version'] = 2;
    $payload['mutation_id'] = (string) Str::uuid();
    $payload['components'] = [];
    $this->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    expect($design->components()->count())->toBe(0);
});

it('saves rails ducts attached devices and routed connections together without leaking designs', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();
    $unrelated = LightingDesign::factory()->for($user)->create();
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingLayoutPayload($design);
    $railId = (string) Str::uuid();
    $payload['rails'] = [[
        'portable_id' => $railId, 'component_definition_id' => null,
        'x_mm' => 20, 'y_mm' => 70, 'length_mm' => 400, 'width_mm' => 35,
    ]];
    $payload['ducts'] = [[
        'portable_id' => (string) Str::uuid(), 'component_definition_id' => null,
        'x_mm' => 20, 'y_mm' => 140, 'length_mm' => 400, 'width_mm' => 40, 'orientation' => 'horizontal',
    ]];
    $payload['components'] = [lightingPlacementPayload($definition), lightingPlacementPayload($definition)];
    $payload['components'][0]['rail_portable_id'] = $railId;
    $payload['components'][1]['x_mm'] = 120;
    $payload['connections'] = [[
        'portable_id' => (string) Str::uuid(),
        'source_portable_id' => $payload['components'][0]['portable_id'], 'source_terminal' => 'L',
        'target_portable_id' => $payload['components'][1]['portable_id'], 'target_terminal' => 'N',
        'cable_type' => 'Power', 'color' => '#2563eb', 'gauge' => '1.5 mm²', 'conductor_count' => 1,
        'route_points' => [['x_mm' => 46.12, 'y_mm' => 42.5], ['x_mm' => 46.12, 'y_mm' => 20], ['x_mm' => 147, 'y_mm' => 20], ['x_mm' => 147, 'y_mm' => 42.5]],
        'actual_length_mm' => 250, 'notes' => 'Blue conductor',
    ]];

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $restored = $this->getJson(route('lighting.designs.show', $design))->assertOk()
        ->assertJsonPath('connections.0.actual_length_mm', 250)->assertJsonPath('connections.0.gauge', '1.5 mm²')
        ->assertJsonPath('connections.0.route_points', $payload['connections'][0]['route_points'])
        ->assertJsonPath('components.0.rail_portable_id', $railId)->json();
    $this->getJson(route('lighting.designs.show', $unrelated))->assertJsonCount(0, 'components')->assertJsonCount(0, 'connections');

    $payload['base_version'] = 1;
    $payload['mutation_id'] = (string) Str::uuid();
    $payload['connections'][0]['notes'] = 'Changed wire';
    $payload['rails'][0]['x_mm'] = 30;
    $payload['components'][0]['x_mm'] += 10;
    $payload['connections'][0]['route_points'][0]['x_mm'] += 10;
    $payload['connections'][0]['route_points'][1]['x_mm'] += 10;
    $this->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    expect($design->connections()->firstOrFail()->notes)->toBe('Changed wire');
    expect($design->rails()->firstOrFail()->x_mm)->toBe(30.0);

    $payload['base_version'] = 2;
    $payload['mutation_id'] = (string) Str::uuid();
    $payload['components'] = [];
    $payload['connections'] = [];
    $this->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    expect($design->connections()->count())->toBe(0);
    expect($design->components()->count())->toBe(0);
    expect($design->rails()->count())->toBe(1);
});

it('rejects foreign endpoints unknown terminals and diagonal routes without partial persistence', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingLayoutPayload($design);
    $placement = lightingPlacementPayload($definition);
    $payload['components'] = [$placement];
    $payload['connections'] = [[
        'portable_id' => (string) Str::uuid(), 'source_portable_id' => $placement['portable_id'],
        'source_terminal' => 'UNKNOWN', 'target_portable_id' => (string) Str::uuid(), 'target_terminal' => 'N',
        'cable_type' => 'Power', 'color' => null, 'gauge' => null, 'conductor_count' => 1,
        'route_points' => [['x_mm' => 0, 'y_mm' => 0], ['x_mm' => 10, 'y_mm' => 10]],
        'actual_length_mm' => null, 'notes' => null,
    ]];

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertUnprocessable()->assertJsonValidationErrors([
            'connections.0.source_terminal', 'connections.0.target_portable_id', 'connections.0.route_points',
        ]);

    expect($design->components()->count())->toBe(0);
    expect($design->connections()->count())->toBe(0);
    expect($design->fresh()->save_version)->toBe(0);
});

it('rejects a cross-design rail reference and a catalog kind mismatch', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();
    $definition = LightingComponentDefinition::factory()->rail()->create();
    $payload = lightingLayoutPayload($design);
    $payload['components'] = [lightingPlacementPayload($definition)];
    $payload['components'][0]['rail_portable_id'] = (string) Str::uuid();

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertUnprocessable()->assertJsonValidationErrors(['components.0.component_definition_id', 'components.0.rail_portable_id']);

    expect($design->components()->count())->toBe(0);
});

it('replays a committed save idempotently and rejects changed reuse and stale editors with 409', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();
    $payload = lightingLayoutPayload($design);

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertOk()->assertJsonPath('save_version', 1);
    $this->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertOk()->assertJsonPath('save_version', 1);

    $payload['design']['name'] = 'Conflicting changes';
    $this->putJson(route('lighting.designs.layout.update', $design), $payload)->assertConflict();
    $payload['mutation_id'] = (string) Str::uuid();
    $this->putJson(route('lighting.designs.layout.update', $design), $payload)->assertConflict();

    expect($design->fresh()->save_version)->toBe(1);
    expect($design->fresh()->name)->toBe($design->name);
});

it('returns 404 for another users aggregate save before inspecting the payload', function (): void {
    $design = LightingDesign::factory()->create();
    $this->actingAs(User::factory()->create())
        ->putJson(route('lighting.designs.layout.update', $design), [])
        ->assertNotFound();
    expect($design->fresh()->save_version)->toBe(0);
});

it('rejects attached placements off the mounting line or beyond the rail extent', function (float $x, float $y): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingLayoutPayload($design);
    $railId = (string) Str::uuid();
    $payload['rails'] = [[
        'portable_id' => $railId, 'component_definition_id' => null,
        'x_mm' => 20, 'y_mm' => 70, 'length_mm' => 400, 'width_mm' => 35,
    ]];
    $payload['components'] = [lightingPlacementPayload($definition)];
    $payload['components'][0]['rail_portable_id'] = $railId;
    $payload['components'][0]['x_mm'] = $x;
    $payload['components'][0]['y_mm'] = $y;

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertUnprocessable()->assertJsonValidationErrors('components.0.rail_portable_id');

    expect($design->components()->count())->toBe(0);
    expect($design->rails()->count())->toBe(0);
})->with([
    'off mounting line' => [37.12, 0.0],
    'past rail end' => [400.0, 42.5],
    'before rail start' => [0.0, 42.5],
]);

it('persists routes anchored to rotated terminals', function (int $rotation, array $points): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingLayoutPayload($design);
    $placement = lightingPlacementPayload($definition);
    $placement['x_mm'] = 10;
    $placement['y_mm'] = 20;
    $placement['rotation'] = $rotation;
    $payload['components'] = [$placement];
    $payload['connections'] = [[
        'portable_id' => (string) Str::uuid(), 'source_portable_id' => $placement['portable_id'],
        'source_terminal' => 'L', 'target_portable_id' => $placement['portable_id'], 'target_terminal' => 'N',
        'cable_type' => 'Test cable', 'color' => null, 'gauge' => null, 'conductor_count' => 1,
        'route_points' => $points, 'actual_length_mm' => null, 'notes' => null,
    ]];

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $this->getJson(route('lighting.designs.show', $design))->assertJsonPath('connections.0.route_points', $points);

    $payload['base_version'] = 1;
    $payload['mutation_id'] = (string) Str::uuid();
    foreach ($payload['connections'][0]['route_points'] as &$point) {
        $point['x_mm'] += 1;
    }
    unset($point);
    $this->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertUnprocessable()->assertJsonValidationErrors('connections.0.route_points');
    expect($design->fresh()->save_version)->toBe(1);
})->with([
    'upright' => [0, [['x_mm' => 19, 'y_mm' => 20], ['x_mm' => 37, 'y_mm' => 20]]],
    'clockwise' => [90, [['x_mm' => 100, 'y_mm' => 29], ['x_mm' => 100, 'y_mm' => 47]]],
    'inverted' => [180, [['x_mm' => 37, 'y_mm' => 110], ['x_mm' => 19, 'y_mm' => 110]]],
    'counterclockwise' => [270, [['x_mm' => 10, 'y_mm' => 47], ['x_mm' => 10, 'y_mm' => 29]]],
]);

it('normalizes physical positions and JSON route points to the database millimeter precision', function (): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingLayoutPayload($design);
    $payload['components'] = [lightingPlacementPayload($definition)];
    $payload['components'][0]['x_mm'] = 37.1249;
    $payload['components'][0]['y_mm'] = 42.5049;
    $id = $payload['components'][0]['portable_id'];
    $payload['connections'] = [[
        'portable_id' => (string) Str::uuid(), 'source_portable_id' => $id, 'source_terminal' => 'L',
        'target_portable_id' => $id, 'target_terminal' => 'N', 'cable_type' => 'Test',
        'color' => null, 'gauge' => null, 'conductor_count' => 1,
        'route_points' => [['x_mm' => 46.1249, 'y_mm' => 42.5049], ['x_mm' => 64.1249, 'y_mm' => 42.5049]],
        'actual_length_mm' => null, 'notes' => null,
    ]];

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)->assertOk();
    $this->getJson(route('lighting.designs.show', $design))
        ->assertJsonPath('components.0.x_mm', 37.12)
        ->assertJsonPath('connections.0.route_points.0.x_mm', 46.12)
        ->assertJsonPath('connections.0.route_points.0.y_mm', 42.5);
});

it('rejects UUID collisions across layout object types without persisting children', function (string $group): void {
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create();
    $definition = LightingComponentDefinition::factory()->create();
    $payload = lightingLayoutPayload($design);
    $placement = lightingPlacementPayload($definition);
    $payload['components'] = [$placement];
    $payload['rails'] = [[
        'portable_id' => (string) Str::uuid(), 'component_definition_id' => null,
        'x_mm' => 20, 'y_mm' => 70, 'length_mm' => 400, 'width_mm' => 35,
    ]];
    $payload['ducts'] = [[
        'portable_id' => (string) Str::uuid(), 'component_definition_id' => null,
        'x_mm' => 20, 'y_mm' => 140, 'length_mm' => 400, 'width_mm' => 40, 'orientation' => 'horizontal',
    ]];
    $payload['connections'] = [[
        'portable_id' => (string) Str::uuid(), 'source_portable_id' => $placement['portable_id'],
        'source_terminal' => 'L', 'target_portable_id' => $placement['portable_id'], 'target_terminal' => 'N',
        'cable_type' => 'Test', 'color' => null, 'gauge' => null, 'conductor_count' => 1,
        'route_points' => [['x_mm' => 46.12, 'y_mm' => 42.5], ['x_mm' => 64.12, 'y_mm' => 42.5]],
        'actual_length_mm' => null, 'notes' => null,
    ]];
    $payload[$group][0]['portable_id'] = $placement['portable_id'];

    $this->actingAs($user)->putJson(route('lighting.designs.layout.update', $design), $payload)
        ->assertUnprocessable()->assertJsonValidationErrors("{$group}.0.portable_id");

    expect($design->components()->count())->toBe(0);
    expect($design->rails()->count())->toBe(0);
    expect($design->ducts()->count())->toBe(0);
    expect($design->connections()->count())->toBe(0);
    expect($design->fresh()->save_version)->toBe(0);
})->with(['rails', 'ducts', 'connections']);
