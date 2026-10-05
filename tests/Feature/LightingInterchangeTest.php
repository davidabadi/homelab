<?php

declare(strict_types=1);

use App\Models\LightingComponentDefinition;
use App\Models\LightingDesign;
use App\Models\LightingDesignComponent;
use App\Models\LightingDesignConnection;
use App\Models\LightingDesignDuct;
use App\Models\LightingDesignRail;
use App\Models\User;
use App\Services\Lighting\LightingDesignExporter;
use App\Services\Lighting\LightingDesignPresenter;
use App\Services\Lighting\LightingInterchangeV1;
use App\Services\Lighting\LightingRowLayout;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;

/** @return array{user: User, design: LightingDesign, definition: LightingComponentDefinition, layout: array<string, mixed>, document: array<string, mixed>} */
function lightingInterchangeFixture(): array
{
    $user = User::factory()->create();
    $design = LightingDesign::factory()->for($user)->create([
        ...LightingRowLayout::DESIGN_DEFAULTS, 'name' => 'Main Lighting Panel',
        'notes' => 'Portable design notes', 'metadata' => ['room' => 'Workshop', 'version' => 2],
    ]);
    $definition = LightingComponentDefinition::factory()->create([
        'image_path' => 'lighting/component-images/private.png',
        'image_url' => 'https://example.com/device.png',
    ]);
    $railDefinition = LightingComponentDefinition::factory()->rail()->create();
    $ductDefinition = LightingComponentDefinition::factory()->duct()->create();
    $rail = LightingDesignRail::factory()->for($design, 'design')->create([
        'component_definition_id' => $railDefinition->id, 'sort_order' => 0,
        'x_mm' => 20, 'y_mm' => 72.5, 'length_mm' => 324, 'width_mm' => 35,
    ]);
    LightingDesignRail::factory()->for($design, 'design')->create([
        'sort_order' => 1, 'x_mm' => 20, 'y_mm' => 212.5, 'length_mm' => 324, 'width_mm' => 35,
    ]);
    $source = LightingDesignComponent::factory()->for($design, 'design')->for($definition, 'definition')->create([
        'rail_id' => $rail->id, 'sort_order' => 0, 'x_mm' => 20, 'y_mm' => 45,
        'custom_label' => 'Left dimmer', 'notes' => 'Feeds garden', 'metadata' => ['channel' => 'garden'],
    ]);
    $target = LightingDesignComponent::factory()->for($design, 'design')->for($definition, 'definition')->create([
        'rail_id' => $rail->id, 'sort_order' => 1, 'x_mm' => 308, 'y_mm' => 45,
        'custom_label' => 'Right dimmer',
    ]);
    LightingDesignDuct::factory()->for($design, 'design')->create([
        'component_definition_id' => $ductDefinition->id, 'x_mm' => 20, 'y_mm' => 145,
        'length_mm' => 324, 'width_mm' => 40, 'orientation' => 'horizontal',
    ]);
    LightingDesignConnection::factory()->for($design, 'design')->create([
        'source_component_id' => $source->id, 'target_component_id' => $target->id,
        'route_points' => [
            ['x_mm' => 29, 'y_mm' => 45], ['x_mm' => 29, 'y_mm' => 165],
            ['x_mm' => 335, 'y_mm' => 165], ['x_mm' => 335, 'y_mm' => 45],
        ],
        'actual_length_mm' => 650, 'notes' => 'Keep route',
    ]);
    $snapshot = app(LightingDesignPresenter::class)->layout($design);
    $layout = [
        ...Arr::only($snapshot, ['rails', 'components', 'ducts', 'connections', 'cable_entries', 'cable_bundles', 'external_cables']),
        'design' => Arr::only($snapshot['design'], LightingDesign::EDITABLE_FIELDS),
    ];
    $document = app(LightingDesignExporter::class)->document($layout);

    return compact('user', 'design', 'definition', 'layout', 'document');
}

/** @param array<string, mixed> $document
 * @return array<string, mixed>
 */
function lightingMissingCatalogDocument(array $document, int $revision = 1): array
{
    $original = $document['components'][0]['catalog_ref'];
    $reference = ['catalog_family_id' => (string) Str::uuid(), 'revision' => $revision];
    foreach ($document['catalog'] as &$snapshot) {
        if (Arr::only($snapshot, ['catalog_family_id', 'revision']) === $original) {
            $snapshot = [...$snapshot, ...$reference];
        }
    }
    unset($snapshot);
    foreach ($document['components'] as &$component) {
        $component['catalog_ref'] = $reference;
    }
    unset($component);

    return $document;
}

it('exports a formatted portable schema v1 current snapshot without writing or exposing local identities', function (): void {
    $fixture = lightingInterchangeFixture();
    $layout = $fixture['layout'];
    $layout['design']['name'] = 'Unsaved Main Lighting';
    $layout['components'][1]['x_mm'] = 280;
    $layout['connections'][0]['route_points'][2]['x_mm'] = 307;
    $layout['connections'][0]['route_points'][3]['x_mm'] = 307;
    $before = $fixture['design']->fresh()->toArray();

    $response = $this->actingAs($fixture['user'])->postJson(route('lighting.designs.export', $fixture['design']), ['layout' => $layout])
        ->assertOk()->assertHeader('Content-Disposition', 'attachment; filename="unsaved-main-lighting.lighting.json"')
        ->assertJsonPath('format', 'homelab-lighting-design')->assertJsonPath('schema_version', 1)
        ->assertJsonPath('components.1.x_mm', 280)->assertJsonCount(3, 'catalog');
    $document = $response->json();

    expect($response->getContent())->toContain("\n    \"format\"");
    expect(array_keys($document['design']))->not->toContain('id', 'user_id', 'save_version');
    foreach (['rows', 'components', 'ducts'] as $group) {
        foreach ($document[$group] as $item) {
            expect(array_keys($item))->not->toContain('id', 'design_id', 'component_definition_id', 'rail_id');
        }
    }
    foreach ($document['catalog'] as $snapshot) {
        expect(array_keys($snapshot))->not->toContain('id', 'image_path', 'local_image_url');
    }
    $device = collect($document['catalog'])->firstWhere('kind', 'component');
    expect($device['has_local_image'])->toBeTrue();
    expect($device['image_url'])->toBe('https://example.com/device.png');
    expect($fixture['design']->fresh()->toArray())->toBe($before);
    expect($fixture['design']->components()->where('sort_order', 1)->firstOrFail()->x_mm)->toBe(308.0);
});

it('round trips complete physical designs into isolated new designs with fresh object UUIDs', function (): void {
    $fixture = lightingInterchangeFixture();

    $response = $this->actingAs($fixture['user'])->postJson(route('lighting.imports.store'), [
        'document' => $fixture['document'], 'name' => 'Main Lighting Panel (imported)', 'resolutions' => [],
    ])->assertCreated()->assertJsonPath('design.name', 'Main Lighting Panel (imported)')
        ->assertJsonPath('design.components_count', 2)->assertJsonPath('design.rails_count', 2)
        ->assertJsonPath('design.metadata.room', 'Workshop');
    $copy = LightingDesign::query()->findOrFail($response->json('design.id'));
    $restored = $this->getJson(route('lighting.designs.show', $copy))->assertOk()->json();

    expect($copy->id)->not->toBe($fixture['design']->id);
    expect($restored['components'][0]['portable_id'])->not->toBe($fixture['document']['components'][0]['portable_id']);
    expect($restored['components'][0]['rail_portable_id'])->toBe($restored['rails'][0]['portable_id']);
    expect($restored['connections'][0]['source_portable_id'])->toBe($restored['components'][0]['portable_id']);
    expect(array_column($restored['components'], 'x_mm'))->toBe([20, 308]);
    expect($restored['components'][0]['metadata'])->toBe(['channel' => 'garden']);
    expect($restored['components'][0]['custom_label'])->toBe('Left dimmer');
    expect($restored['connections'][0]['route_points'])->toBe($fixture['document']['connections'][0]['route_points']);
    expect($restored['ducts'][0]['length_mm'])->toBe(324);
    $copy->components()->where('sort_order', 1)->update(['x_mm' => 280]);

    expect($fixture['design']->components()->where('sort_order', 1)->firstOrFail()->x_mm)->toBe(308.0);
    expect(LightingComponentDefinition::query()->count())->toBe(3);
});

it('allows distinct catalog components to share ordinary terminal keys', function (): void {
    $fixture = lightingInterchangeFixture();
    $other = LightingComponentDefinition::factory()->create(['model' => 'DIN-36-B']);
    $layout = $fixture['layout'];
    $layout['components'][1]['component_definition_id'] = $other->id;

    $response = $this->actingAs($fixture['user'])->postJson(route('lighting.designs.export', $fixture['design']), ['layout' => $layout])
        ->assertOk()->assertJsonCount(4, 'catalog');
    $this->postJson(route('lighting.imports.preflight'), ['document' => $response->json()])
        ->assertOk()->assertJsonPath('ready', true);
});

it('preserves previously supported upright rotated DIN placements during interchange', function (): void {
    $fixture = lightingInterchangeFixture();
    $layout = $fixture['layout'];
    $layout['components'][0]['rotation'] = 180;
    $layout['connections'][0]['route_points'][0] = ['x_mm' => 47, 'y_mm' => 135];
    $layout['connections'][0]['route_points'][1]['x_mm'] = 47;

    $response = $this->actingAs($fixture['user'])->postJson(route('lighting.designs.export', $fixture['design']), ['layout' => $layout])->assertOk();
    $created = $this->postJson(route('lighting.imports.store'), ['document' => $response->json(), 'name' => 'Legacy rotation'])->assertCreated();
    $this->getJson(route('lighting.designs.show', $created->json('design.id')))->assertOk()
        ->assertJsonPath('components.0.rotation', 180)->assertJsonPath('components.0.x_mm', 20);
});

it('resolves exact catalog identities automatically including archived referenced revisions', function (): void {
    $fixture = lightingInterchangeFixture();
    $fixture['definition']->update(['archived_at' => now()]);
    LightingComponentDefinition::factory()->create([
        'catalog_family_id' => $fixture['definition']->catalog_family_id, 'revision' => 2, 'width_mm' => 72,
    ]);

    $this->actingAs($fixture['user'])->postJson(route('lighting.imports.preflight'), ['document' => $fixture['document']])
        ->assertOk()->assertJsonPath('ready', true);
    $this->postJson(route('lighting.imports.store'), ['document' => $fixture['document'], 'name' => 'Older revision'])
        ->assertCreated();
    $copy = LightingDesign::query()->latest('id')->firstOrFail();

    expect($copy->components()->firstOrFail()->component_definition_id)->toBe($fixture['definition']->id);
    expect($copy->components()->firstOrFail()->definition->width_mm)->toBe(36.0);
});

it('reports missing catalog definitions before any design is created and blocks unresolved imports', function (): void {
    $fixture = lightingInterchangeFixture();
    $document = lightingMissingCatalogDocument($fixture['document'], 3);

    $response = $this->actingAs($fixture['user'])->postJson(route('lighting.imports.preflight'), ['document' => $document])
        ->assertOk()->assertJsonPath('ready', false);
    $missing = collect($response->json('entries'))->firstWhere('status', 'missing');
    expect($missing['snapshot']['revision'])->toBe(3);
    expect($missing['snapshot']['manufacturer'])->toBe('Sample');
    $this->postJson(route('lighting.imports.store'), ['document' => $document, 'name' => 'Blocked'])
        ->assertUnprocessable()->assertJsonValidationErrors('resolutions');

    expect(LightingDesign::query()->count())->toBe(1);
    expect(LightingComponentDefinition::query()->count())->toBe(3);
});

it('does not substitute a family newer revision for an absent required revision', function (): void {
    $fixture = lightingInterchangeFixture();
    $document = lightingMissingCatalogDocument($fixture['document'], 3);
    $family = $document['components'][0]['catalog_ref']['catalog_family_id'];
    LightingComponentDefinition::factory()->create(['catalog_family_id' => $family, 'revision' => 4, 'width_mm' => 72]);

    $response = $this->actingAs($fixture['user'])->postJson(route('lighting.imports.preflight'), ['document' => $document])
        ->assertOk()->assertJsonPath('ready', false);

    expect(collect($response->json('entries'))->firstWhere('status', 'missing')['catalog_ref']['revision'])->toBe(3);
});

it('creates a reviewed missing exact catalog revision through the existing catalog flow', function (): void {
    $fixture = lightingInterchangeFixture();
    $document = lightingMissingCatalogDocument($fixture['document'], 3);
    $snapshot = collect($document['catalog'])->firstWhere('kind', 'component');
    $payload = Arr::except($snapshot, ['catalog_family_id', 'revision', 'has_local_image']);
    $payload['import_snapshot'] = json_encode($snapshot, JSON_THROW_ON_ERROR);

    $created = $this->actingAs($fixture['user'])->postJson(route('lighting.definitions.store'), $payload)
        ->assertCreated()->assertJsonPath('definition.catalog_family_id', $snapshot['catalog_family_id'])
        ->assertJsonPath('definition.revision', 3)->assertJsonPath('definition.image_path', null);
    $this->postJson(route('lighting.imports.preflight'), ['document' => $document])
        ->assertOk()->assertJsonPath('ready', true);
    $this->postJson(route('lighting.imports.store'), [
        'document' => $document, 'name' => 'Reviewed import',
        'resolutions' => [['catalog_ref' => $document['components'][0]['catalog_ref'], 'component_definition_id' => $created->json('definition.id')]],
    ])->assertCreated();

    expect(LightingComponentDefinition::query()->count())->toBe(4);
    expect(LightingDesign::query()->count())->toBe(2);
});

it('retains imported catalog identity after normalizing legacy terminal precision and optional fields', function (): void {
    $fixture = lightingInterchangeFixture();
    $document = lightingMissingCatalogDocument($fixture['document']);
    $snapshot = collect($document['catalog'])->firstWhere('kind', 'component');
    $snapshot['terminals'][0]['x_mm'] = 7.571;
    unset($snapshot['terminals'][0]['purpose'], $snapshot['terminals'][0]['metadata']);
    $payload = Arr::except($snapshot, ['catalog_family_id', 'revision', 'has_local_image']);
    $payload['terminals'][0]['purpose'] = null;
    $payload['terminals'][0]['metadata'] = [];
    $payload['import_snapshot'] = json_encode($snapshot, JSON_THROW_ON_ERROR);

    $created = $this->actingAs($fixture['user'])->postJson(route('lighting.definitions.store'), $payload)
        ->assertCreated()->assertJsonPath('definition.catalog_family_id', $snapshot['catalog_family_id'])
        ->assertJsonPath('definition.revision', $snapshot['revision']);

    expect($created->json('definition.terminals.0.x_mm'))->toBe(7.57);
    expect(LightingInterchangeV1::samePhysicalDefinition($snapshot, $created->json('definition')))->toBeTrue();
});

it('forks edited physical catalog snapshots and accepts explicit compatible selections', function (): void {
    $fixture = lightingInterchangeFixture();
    $document = lightingMissingCatalogDocument($fixture['document'], 3);
    $snapshot = collect($document['catalog'])->firstWhere('kind', 'component');
    $payload = [
        ...Arr::except($snapshot, ['catalog_family_id', 'revision', 'has_local_image']),
        'width_mm' => 35, 'import_snapshot' => $snapshot,
    ];

    $created = $this->actingAs($fixture['user'])->postJson(route('lighting.definitions.store'), $payload)->assertCreated();
    expect($created->json('definition.catalog_family_id'))->not->toBe($snapshot['catalog_family_id']);
    $resolutions = [['catalog_ref' => $document['components'][0]['catalog_ref'], 'component_definition_id' => $created->json('definition.id')]];
    $this->postJson(route('lighting.imports.preflight'), ['document' => $document, 'resolutions' => $resolutions])
        ->assertOk()->assertJsonPath('ready', true);
    $this->postJson(route('lighting.imports.store'), ['document' => $document, 'name' => 'Edited import', 'resolutions' => $resolutions])
        ->assertCreated();
});

it('keeps the highest catalog revision visible when an older missing revision is imported later', function (): void {
    $fixture = lightingInterchangeFixture();
    $document = lightingMissingCatalogDocument($fixture['document'], 3);
    $snapshot = collect($document['catalog'])->firstWhere('kind', 'component');
    $latest = LightingComponentDefinition::factory()->create(['catalog_family_id' => $snapshot['catalog_family_id'], 'revision' => 4]);

    $this->actingAs($fixture['user'])->postJson(route('lighting.definitions.store'), [
        ...Arr::except($snapshot, ['catalog_family_id', 'revision', 'has_local_image']),
        'import_snapshot' => $snapshot,
    ])->assertCreated()->assertJsonPath('definition.revision', 3);
    $response = $this->getJson(route('lighting.definitions.index'))->assertOk();
    $visible = collect($response->json('definitions'))->firstWhere('catalog_family_id', $snapshot['catalog_family_id']);

    expect($visible['id'])->toBe($latest->id);
    expect($visible['revision'])->toBe(4);
});

it('rejects duplicate and unknown explicit catalog selections', function (): void {
    $fixture = lightingInterchangeFixture();
    $resolution = ['catalog_ref' => $fixture['document']['components'][0]['catalog_ref'], 'component_definition_id' => $fixture['definition']->id];

    $this->actingAs($fixture['user'])->postJson(route('lighting.imports.preflight'), [
        'document' => $fixture['document'], 'resolutions' => [$resolution, $resolution],
    ])->assertUnprocessable()->assertJsonValidationErrors('resolutions.1.catalog_ref');
    $resolution['component_definition_id'] = 999999;
    $this->postJson(route('lighting.imports.preflight'), ['document' => $fixture['document'], 'resolutions' => [$resolution]])
        ->assertUnprocessable()->assertJsonValidationErrors('resolutions.0.component_definition_id');

    expect(LightingDesign::query()->count())->toBe(1);
});

it('imports the same document repeatedly with independent design children', function (): void {
    $fixture = lightingInterchangeFixture();
    $this->actingAs($fixture['user']);
    foreach (['First import', 'Second import'] as $name) {
        $this->postJson(route('lighting.imports.store'), ['document' => $fixture['document'], 'name' => $name])->assertCreated();
    }
    $imported = LightingDesign::query()->where('id', '!=', $fixture['design']->id)->with('components')->get();

    expect($imported)->toHaveCount(2);
    expect($imported[0]->components[0]->portable_id)->not->toBe($imported[1]->components[0]->portable_id);
    expect($imported[0]->components[1]->x_mm)->toBe(308.0);
    expect($imported[1]->components[1]->x_mm)->toBe(308.0);
});

it('reports conflicting physical details under the same catalog identity', function (): void {
    $fixture = lightingInterchangeFixture();
    $fixture['definition']->update(['width_mm' => 72]);

    $response = $this->actingAs($fixture['user'])->postJson(route('lighting.imports.preflight'), ['document' => $fixture['document']])
        ->assertOk()->assertJsonPath('ready', false);

    expect(collect($response->json('entries'))->firstWhere('status', 'conflict')['definition']['id'])->toBe($fixture['definition']->id);
});

it('creates a fresh reviewed definition for a conflicting immutable catalog identity', function (): void {
    $fixture = lightingInterchangeFixture();
    $fixture['definition']->update(['width_mm' => 72]);
    $snapshot = collect($fixture['document']['catalog'])->firstWhere('kind', 'component');

    $created = $this->actingAs($fixture['user'])->postJson(route('lighting.definitions.store'), [
        ...Arr::except($snapshot, ['catalog_family_id', 'revision', 'has_local_image']),
        'import_snapshot' => $snapshot,
    ])->assertCreated();
    expect($created->json('definition.catalog_family_id'))->not->toBe($snapshot['catalog_family_id']);
    $this->postJson(route('lighting.imports.store'), [
        'document' => $fixture['document'], 'name' => 'Reviewed conflict',
        'resolutions' => [['catalog_ref' => $fixture['document']['components'][0]['catalog_ref'], 'component_definition_id' => $created->json('definition.id')]],
    ])->assertCreated();

    expect($fixture['definition']->fresh()->width_mm)->toBe(72.0);
});

it('validates actual resolved dimensions rather than trusting exported snapshots', function (): void {
    $fixture = lightingInterchangeFixture();
    $document = lightingMissingCatalogDocument($fixture['document']);
    $wide = LightingComponentDefinition::factory()->create(['width_mm' => 72]);

    $this->actingAs($fixture['user'])->postJson(route('lighting.imports.store'), [
        'document' => $document, 'name' => 'Too wide',
        'resolutions' => [['catalog_ref' => $document['components'][0]['catalog_ref'], 'component_definition_id' => $wide->id]],
    ])->assertUnprocessable()->assertJsonValidationErrors('document.components.1.x_mm');

    expect(LightingDesign::query()->count())->toBe(1);
});

it('rejects malformed or unsupported interchange documents', function (mixed $input, string $field): void {
    $this->actingAs(User::factory()->create())->postJson(route('lighting.imports.preflight'), ['document' => $input])
        ->assertUnprocessable()->assertJsonValidationErrors($field);

    expect(LightingDesign::query()->count())->toBe(0);
})->with([
    'malformed JSON' => ['{', 'document'],
    'array document' => [[], 'document'],
    'wrong format' => [['format' => 'database-backup', 'schema_version' => 1], 'document.format'],
    'future schema' => [['format' => 'homelab-lighting-design', 'schema_version' => 2], 'document.schema_version'],
]);

it('rejects invalid portable references and physically invalid imported layouts', function (Closure $change, string $field): void {
    $fixture = lightingInterchangeFixture();
    $document = $fixture['document'];
    $change($document);

    $this->actingAs($fixture['user'])->postJson(route('lighting.imports.preflight'), ['document' => $document])
        ->assertUnprocessable()->assertJsonValidationErrors($field);

    expect(LightingDesign::query()->count())->toBe(1);
})->with([
    'missing collection' => [function (array &$document): void {
        unset($document['rows']);
    }, 'document.rows'],
    'duplicate object UUID' => [function (array &$document): void {
        $document['components'][0]['portable_id'] = $document['rows'][0]['portable_id'];
    }, 'document.components.0.portable_id'],
    'invalid UUID' => [function (array &$document): void {
        $document['components'][0]['portable_id'] = 'not-a-uuid';
    }, 'document.components.0.portable_id'],
    'unknown catalog' => [function (array &$document): void {
        $document['components'][0]['catalog_ref']['revision'] = 99;
    }, 'document.components.0.catalog_ref'],
    'incomplete catalog reference' => [function (array &$document): void {
        unset($document['components'][0]['catalog_ref']['catalog_family_id']);
    }, 'document.components.0.catalog_ref'],
    'unknown row' => [function (array &$document): void {
        $document['components'][0]['rail_portable_id'] = (string) Str::uuid();
    }, 'document.components.0.rail_portable_id'],
    'unknown connection component' => [function (array &$document): void {
        $document['connections'][0]['source_portable_id'] = (string) Str::uuid();
    }, 'document.connections.0.source_portable_id'],
    'unknown terminal' => [function (array &$document): void {
        $document['connections'][0]['source_terminal'] = 'unknown';
    }, 'document.connections.0.source_terminal'],
    'wrong endpoint coordinate' => [function (array &$document): void {
        $document['connections'][0]['route_points'][0]['x_mm'] = 30;
    }, 'document.connections.0.route_points'],
    'diagonal cable' => [function (array &$document): void {
        $document['connections'][0]['route_points'][1]['x_mm'] = 30;
    }, 'document.connections.0.route_points'],
    'overlapping devices' => [function (array &$document): void {
        $document['components'][1]['x_mm'] = 40;
    }, 'document.components.1.x_mm'],
    'outside rail' => [function (array &$document): void {
        $document['components'][1]['x_mm'] = 309;
    }, 'document.components.1.x_mm'],
    'local catalog path' => [function (array &$document): void {
        $document['catalog'][0]['image_path'] = 'secret/local.png';
    }, 'document.catalog.0'],
    'duplicate catalog identity' => [function (array &$document): void {
        $document['catalog'][] = $document['catalog'][0];
    }, 'document.catalog.3.catalog_family_id'],
]);

it('rejects unreferenced catalog snapshots instead of requiring unused definitions to be created', function (): void {
    $fixture = lightingInterchangeFixture();
    $document = $fixture['document'];
    $unused = $document['catalog'][0];
    $unused['catalog_family_id'] = (string) Str::uuid();
    $document['catalog'][] = $unused;

    $response = $this->actingAs($fixture['user'])->postJson(route('lighting.imports.preflight'), ['document' => $document])
        ->assertUnprocessable()->assertJsonValidationErrors('document.catalog.3.catalog_family_id');

    expect($response->json('errors')['document.catalog.3.catalog_family_id'][0])->toBe('Catalog snapshots must be referenced by this design.');
    expect(LightingDesign::query()->count())->toBe(1);
    expect(LightingComponentDefinition::query()->count())->toBe(3);
});

it('rolls back the complete imported design if creating a child fails', function (): void {
    $fixture = lightingInterchangeFixture();
    $eventName = 'eloquent.creating: '.LightingDesignComponent::class;
    Event::listen($eventName, function (LightingDesignComponent $component) use ($fixture): void {
        if ($component->design_id !== $fixture['design']->id && $component->sort_order === 1) {
            throw new RuntimeException('Simulated child write failure');
        }
    });
    $this->withoutExceptionHandling();

    try {
        expect(fn () => $this->actingAs($fixture['user'])->postJson(route('lighting.imports.store'), [
            'document' => $fixture['document'], 'name' => 'Rollback import',
        ]))->toThrow(RuntimeException::class, 'Simulated child write failure');
    } finally {
        Event::forget($eventName);
    }

    expect(LightingDesign::query()->count())->toBe(1);
    expect(LightingDesignRail::query()->count())->toBe(2);
    expect(LightingDesignComponent::query()->count())->toBe(2);
    expect(LightingDesignDuct::query()->count())->toBe(1);
    expect(LightingDesignConnection::query()->count())->toBe(1);
    expect(LightingComponentDefinition::query()->count())->toBe(3);
});

it('timestamps portable exports in UTC regardless of the application timezone', function (): void {
    $originalTimezone = date_default_timezone_get();
    date_default_timezone_set('America/New_York');

    try {
        $fixture = lightingInterchangeFixture();
        expect($fixture['document']['exported_at'])->toEndWith('+00:00');
    } finally {
        date_default_timezone_set($originalTimezone);
    }
});

it('protects export ownership and requires authentication for interchange endpoints', function (): void {
    $fixture = lightingInterchangeFixture();
    $this->postJson(route('lighting.imports.preflight'), ['document' => $fixture['document']])->assertUnauthorized();
    $this->postJson(route('lighting.imports.store'), ['document' => $fixture['document'], 'name' => 'Private'])->assertUnauthorized();
    $this->postJson(route('lighting.designs.export', $fixture['design']), ['layout' => $fixture['layout']])->assertUnauthorized();
    $this->actingAs(User::factory()->create())->postJson(route('lighting.designs.export', $fixture['design']), ['layout' => $fixture['layout']])->assertNotFound();
});
