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
