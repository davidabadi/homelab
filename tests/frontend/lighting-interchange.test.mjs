import assert from 'node:assert/strict';
import test from 'node:test';
import {
    catalogReferenceKey,
    importedDesignName,
    parseLightingInterchange,
} from '../../resources/js/components/lighting/interchange.ts';

function exportDocument(overrides = {}) {
    return {
        format: 'homelab-lighting-design',
        schema_version: 1,
        exported_at: '2026-10-05T12:30:00Z',
        design: { name: 'Main lighting panel', metadata: { room: 'Utility' } },
        catalog: [],
        rows: [{ portable_id: 'row-1', sort_order: 0 }],
        components: [
            { portable_id: 'device-1', rail_portable_id: 'row-1', x_mm: 272.5 },
        ],
        ducts: [],
        connections: [],
        cable_entries: [],
        cable_bundles: [],
        external_cables: [],
        ...overrides,
    };
}

test('parses a lighting export without changing positions or metadata', () => {
    const document = exportDocument();

    const parsed = parseLightingInterchange(JSON.stringify(document));

    assert.deepEqual(parsed, document);
    assert.equal(parsed.components[0].x_mm, 272.5);
});

test('accepts JSON files with a UTF-8 byte order mark', () => {
    const document = exportDocument();

    const parsed = parseLightingInterchange(
        `\uFEFF${JSON.stringify(document)}`,
    );

    assert.deepEqual(parsed, document);
});

test('rejects malformed JSON with a readable file error', () => {
    assert.throws(() => parseLightingInterchange('{broken'), /valid JSON/);
});

test('rejects a document that is not a JSON object', () => {
    for (const value of [null, [], true, 'lighting']) {
        assert.throws(
            () => parseLightingInterchange(JSON.stringify(value)),
            /JSON object/,
        );
    }
});

test('rejects another export format', () => {
    const document = exportDocument({ format: 'database-backup' });

    assert.throws(
        () => parseLightingInterchange(JSON.stringify(document)),
        /not a Homelab/,
    );
});

test('rejects unsupported and nonnumeric schema versions', () => {
    for (const schema_version of [2, 0, '1', undefined]) {
        const document = exportDocument({ schema_version });

        assert.throws(
            () => parseLightingInterchange(JSON.stringify(document)),
            /schema version/,
        );
    }
});

test('rejects exports missing a valid date or design name', () => {
    for (const overrides of [
        { exported_at: null },
        { exported_at: 'yesterday' },
        { design: null },
        { design: { name: ' ' } },
    ]) {
        assert.throws(() =>
            parseLightingInterchange(JSON.stringify(exportDocument(overrides))),
        );
    }
});

test('rejects absent layout arrays and invalid objects within them', () => {
    for (const field of [
        'catalog',
        'rows',
        'components',
        'ducts',
        'connections',
        'cable_entries',
        'cable_bundles',
        'external_cables',
    ]) {
        for (const value of [undefined, {}, [null], ['device']]) {
            const document = exportDocument({ [field]: value });

            assert.throws(
                () => parseLightingInterchange(JSON.stringify(document)),
                new RegExp(field),
            );
        }
    }
});

test('rejects oversized files by UTF-8 bytes rather than character count', () => {
    const contents = 'é'.repeat(6_000_000);

    assert.throws(
        () => parseLightingInterchange(contents),
        /smaller than 10 MB/,
    );
});

test('distinguishes catalog references by revision', () => {
    const first = { catalog_family_id: 'family-a', revision: 1 };
    const second = { catalog_family_id: 'family-a', revision: 2 };

    assert.equal(catalogReferenceKey(first), 'family-a:1');
    assert.notEqual(catalogReferenceKey(first), catalogReferenceKey(second));
});

test('names the imported copy and preserves the suffix for long names', () => {
    assert.equal(
        importedDesignName(' Main lighting panel '),
        'Main lighting panel (imported)',
    );
    assert.equal(importedDesignName('x'.repeat(255)).length, 255);
    assert.ok(importedDesignName('x'.repeat(255)).endsWith(' (imported)'));
});

function cabledDocument() {
    return exportDocument({
        cable_entries: [
            {
                portable_id: 'entry-1',
                side: 'bottom',
                offset_mm: 20,
                span_mm: 40,
            },
        ],
        cable_bundles: [
            {
                portable_id: 'bundle-1',
                cable_entry_portable_id: 'entry-1',
                route_points: [
                    { x_mm: 40, y_mm: 320 },
                    { x_mm: 40, y_mm: 280 },
                ],
            },
        ],
        external_cables: [
            {
                portable_id: 'cable-1',
                bundle_portable_id: 'bundle-1',
                cable_entry_portable_id: null,
                internal_component_portable_id: 'device-1',
                internal_terminal: 'L',
                branch_route_points: [
                    { x_mm: 40, y_mm: 280 },
                    { x_mm: 40, y_mm: 45 },
                ],
            },
            {
                portable_id: 'cable-2',
                bundle_portable_id: null,
                cable_entry_portable_id: 'entry-1',
                internal_component_portable_id: null,
                internal_terminal: null,
                branch_route_points: [],
            },
        ],
    });
}

test('parses bundled assigned and direct unassigned cables without changing portable references', () => {
    const document = cabledDocument();
    assert.deepEqual(
        parseLightingInterchange(JSON.stringify(document)),
        document,
    );
});

test('rejects cabling references outside the portable document graph', () => {
    for (const change of [
        (document) => {
            document.cable_bundles[0].cable_entry_portable_id = 'foreign-entry';
        },
        (document) => {
            document.external_cables[0].bundle_portable_id = 'foreign-bundle';
        },
        (document) => {
            document.external_cables[1].cable_entry_portable_id =
                'foreign-entry';
        },
        (document) => {
            document.external_cables[0].internal_component_portable_id =
                'foreign-component';
        },
        (document) => {
            document.external_cables[0].cable_entry_portable_id = 'entry-1';
        },
        (document) => {
            document.external_cables[0].internal_terminal = null;
        },
        (document) => {
            document.external_cables[1].cable_entry_portable_id = null;
        },
    ]) {
        const document = cabledDocument();
        change(document);
        assert.throws(
            () => parseLightingInterchange(JSON.stringify(document)),
            /references|reference|termination/,
        );
    }
});

test('rejects portable ID collisions between internal and external layout objects', () => {
    const document = cabledDocument();
    document.external_cables[0].portable_id = document.rows[0].portable_id;
    assert.throws(
        () => parseLightingInterchange(JSON.stringify(document)),
        /duplicate portable IDs/,
    );
});

test('rejects malformed trunk and branch point shapes before import review', () => {
    for (const field of ['route_points', 'branch_route_points']) {
        const document = cabledDocument();
        const target =
            field === 'route_points'
                ? document.cable_bundles[0]
                : document.external_cables[0];
        target[field] = [{ x_mm: 40, y_mm: '280' }];
        assert.throws(
            () => parseLightingInterchange(JSON.stringify(document)),
            /valid millimeter points/,
        );
    }
});
