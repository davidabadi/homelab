import assert from 'node:assert/strict';
import test from 'node:test';
import {
    bundleBreakoutPoint,
    cableEntryPoint,
    clampCableEntryOffset,
    externalCableLengthMm,
    externalCableOrigin,
    moveCableEntry,
    refreshExternalCabling,
} from '../../resources/js/components/lighting/external-cabling.ts';
import {
    deleteLayoutObjects,
    layoutSnapshot,
} from '../../resources/js/components/lighting/layout-state.ts';
import {
    insertPanelRow,
    movePanelDevice,
    normalizePanelLayout,
} from '../../resources/js/components/lighting/panel-layout.ts';
import { LightingSaveQueue } from '../../resources/js/components/lighting/save-queue.ts';

const point = (x_mm, y_mm) => ({ x_mm, y_mm });
const entry = (side = 'bottom', overrides = {}) => ({
    portable_id: 'entry-1',
    label: 'AC mains',
    side,
    offset_mm: 20,
    span_mm: 40,
    entry_type: 'conduit',
    notes: 'From electrical panel',
    metadata: {},
    ...overrides,
});

function layout() {
    return {
        design: {
            id: 1,
            name: 'Cabled panel',
            width_mm: 364,
            height_mm: 320,
            depth_mm: 120,
            margin_top_mm: 20,
            margin_right_mm: 20,
            margin_bottom_mm: 20,
            margin_left_mm: 20,
            grid_size_mm: 5,
            snap_to_grid: true,
            notes: null,
            metadata: {},
            save_version: 2,
            updated_at: '2026-10-05T00:00:00Z',
        },
        definitions: [
            {
                id: 1,
                display_name: 'Power supply',
                width_mm: 72,
                height_mm: 90,
                mounting_type: 'din-rail',
                mounting_anchor_x_mm: 36,
                mounting_anchor_y_mm: 45,
                terminals: [
                    {
                        key: 'L',
                        label: 'AC line',
                        ...point(12, 0),
                        side: 'top',
                        purpose: 'power',
                    },
                ],
            },
        ],
        rails: [0, 1].map((sort_order) => ({
            portable_id: `row-${sort_order + 1}`,
            sort_order,
            component_definition_id: null,
            ...point(20, 72.5 + 140 * sort_order),
            length_mm: 324,
            width_mm: 35,
        })),
        components: [
            {
                portable_id: 'device-1',
                component_definition_id: 1,
                ...point(40, 45),
                rotation: 0,
                rail_portable_id: 'row-1',
                sort_order: 0,
                custom_label: 'PSU',
                notes: null,
                metadata: {},
            },
        ],
        ducts: [],
        connections: [],
        cable_entries: [entry()],
        cable_bundles: [
            {
                portable_id: 'bundle-1',
                cable_entry_portable_id: 'entry-1',
                name: 'AC Feed',
                external_location: 'Electrical panel',
                cable_class: 'line_voltage',
                direction: 'incoming',
                display_color: null,
                planned_count: 1,
                route_points: [point(40, 320), point(40, 280)],
                notes: null,
                metadata: {},
            },
        ],
        external_cables: [
            {
                portable_id: 'cable-1',
                bundle_portable_id: 'bundle-1',
                cable_entry_portable_id: null,
                label: 'AC feed',
                cable_type: 'Power cable',
                gauge: '14 AWG',
                conductor_count: 3,
                internal_component_portable_id: 'device-1',
                internal_terminal: 'L',
                branch_route_points: [
                    point(40, 280),
                    point(100, 280),
                    point(100, 45),
                    point(52, 45),
                ],
                cable_class: null,
                direction: null,
                notes: null,
                metadata: { circuit: 'PSU' },
            },
        ],
    };
}

function assertOrthogonal(points) {
    for (let index = 1; index < points.length; index++) {
        assert.ok(
            points[index - 1].x_mm === points[index].x_mm ||
                points[index - 1].y_mm === points[index].y_mm,
        );
    }
}

test('entry anchors resolve span midpoints on all four physical enclosure edges', () => {
    const dimensions = layout().design;

    for (const [side, expected] of [
        ['top', point(40, 0)],
        ['bottom', point(40, 320)],
        ['left', point(0, 40)],
        ['right', point(364, 40)],
    ]) {
        assert.deepEqual(cableEntryPoint(entry(side), dimensions), expected);
    }
});

test('entry dragging ignores perpendicular movement and clamps the full span to its side', () => {
    const dimensions = layout().design;
    assert.equal(
        moveCableEntry(entry('top'), dimensions, point(-100, 500)).offset_mm,
        0,
    );
    assert.equal(
        moveCableEntry(entry('bottom'), dimensions, point(1000, -500))
            .offset_mm,
        324,
    );
    assert.equal(
        moveCableEntry(entry('right'), dimensions, point(-1000, 1000))
            .offset_mm,
        280,
    );
    assert.equal(
        moveCableEntry(entry('left'), dimensions, point(1000, 72.25)).offset_mm,
        52.25,
    );
    assert.equal(
        clampCableEntryOffset(entry('bottom', { offset_mm: 900 }), dimensions),
        324,
    );
});

test('adding a DIN row moves the bottom trunk start with the enclosure and preserves the breakout', () => {
    const original = layout();
    const grown = insertPanelRow(original);
    assert.equal(grown.design.height_mm, 460);
    assert.deepEqual(grown.cable_bundles[0].route_points[0], point(40, 460));
    assert.deepEqual(
        bundleBreakoutPoint(grown.cable_bundles[0]),
        point(40, 280),
    );
    assert.deepEqual(
        grown.external_cables[0].branch_route_points,
        original.external_cables[0].branch_route_points,
    );
    assert.equal(grown.cable_entries[0].offset_mm, 20);
    assert.equal('y_mm' in grown.cable_entries[0], false);
    assert.equal(original.design.height_mm, 320);
});

test('moving an entry reroutes the single shared trunk while every member keeps one common breakout', () => {
    const original = layout();
    original.external_cables.push({
        ...original.external_cables[0],
        portable_id: 'cable-2',
        internal_component_portable_id: null,
        internal_terminal: null,
        branch_route_points: [],
    });
    original.cable_entries[0].offset_mm = 80;
    const moved = refreshExternalCabling(original);
    assert.equal(moved.cable_bundles.length, 1);
    assert.equal(moved.external_cables.length, 2);
    assert.deepEqual(moved.cable_bundles[0].route_points[0], point(100, 320));
    assert.deepEqual(
        externalCableOrigin(moved.external_cables[1], moved),
        point(40, 280),
    );
    assert.deepEqual(moved.external_cables[1].branch_route_points, []);
    assertOrthogonal(moved.cable_bundles[0].route_points);
});

test('moving a DIN device updates its assigned branch terminal while preserving deliberate bends', () => {
    const moved = movePanelDevice(layout(), 'device-1', 'row-2', 120);
    const branch = moved.external_cables[0].branch_route_points;
    assert.deepEqual(branch[0], point(40, 280));
    assert.deepEqual(branch.at(-1), point(132, 185));
    assert.deepEqual(branch[1], point(100, 280));
    assertOrthogonal(branch);
});

test('moving a bundle breakout updates branch starts while unchanged routes remain verbatim', () => {
    const original = layout();
    assert.deepEqual(
        normalizePanelLayout(original).external_cables[0].branch_route_points,
        original.external_cables[0].branch_route_points,
    );
    original.cable_bundles[0].route_points = [
        point(40, 320),
        point(40, 280),
        point(80, 280),
    ];
    const changed = refreshExternalCabling(original);
    assert.deepEqual(
        changed.external_cables[0].branch_route_points[0],
        point(80, 280),
    );
    assert.deepEqual(
        changed.external_cables[0].branch_route_points.at(-1),
        point(52, 45),
    );
    assertOrthogonal(changed.external_cables[0].branch_route_points);
});

test('standalone cables anchor directly to entries and retain their own class and direction', () => {
    const original = layout();
    original.external_cables[0] = {
        ...original.external_cables[0],
        bundle_portable_id: null,
        cable_entry_portable_id: 'entry-1',
        cable_class: 'data',
        direction: 'outgoing',
    };
    const restored = refreshExternalCabling(original);
    assert.deepEqual(
        restored.external_cables[0].branch_route_points[0],
        point(40, 320),
    );
    assert.equal(restored.external_cables[0].cable_class, 'data');
    assert.equal(restored.external_cables[0].direction, 'outgoing');
});

test('right-edge entries and standalone branches follow width changes without moving their manual branch end', () => {
    const original = layout();
    original.cable_entries[0] = entry('right');
    original.cable_bundles = [];
    original.external_cables[0] = {
        ...original.external_cables[0],
        bundle_portable_id: null,
        cable_entry_portable_id: 'entry-1',
        cable_class: 'data',
        direction: 'incoming',
        internal_component_portable_id: null,
        internal_terminal: null,
        branch_route_points: [point(364, 40), point(300, 40), point(300, 100)],
    };
    original.design.width_mm = 500;

    const changed = normalizePanelLayout(original);

    assert.deepEqual(changed.external_cables[0].branch_route_points, [
        point(500, 40),
        point(300, 40),
        point(300, 100),
    ]);
    assert.equal(
        changed.external_cables[0].internal_component_portable_id,
        null,
    );
    assert.equal(changed.external_cables[0].cable_class, 'data');
    assert.equal(changed.cable_entries[0].offset_mm, 20);
});

test('bundled cables always inherit classification and direction while missing origins are refused', () => {
    const original = layout();
    original.external_cables[0].cable_class = 'data';
    original.external_cables[0].direction = 'outgoing';

    const changed = refreshExternalCabling(original);

    assert.equal(changed.external_cables[0].cable_class, null);
    assert.equal(changed.external_cables[0].direction, null);
    assert.equal(changed.cable_bundles[0].cable_class, 'line_voltage');
    assert.equal(changed.cable_bundles[0].direction, 'incoming');
    original.external_cables[0].bundle_portable_id = 'foreign-bundle';
    assert.throws(
        () => refreshExternalCabling(original),
        /existing bundle or cable entry/,
    );
});

test('deleting a component keeps its physical cable and unassigns both termination fields', () => {
    const deleted = deleteLayoutObjects(layout(), [
        { type: 'component', id: 'device-1' },
    ]);
    assert.equal(deleted.components.length, 0);
    assert.equal(deleted.external_cables.length, 1);
    assert.equal(
        deleted.external_cables[0].internal_component_portable_id,
        null,
    );
    assert.equal(deleted.external_cables[0].internal_terminal, null);
    assert.deepEqual(deleted.external_cables[0].branch_route_points, []);
    assert.equal(deleted.external_cables[0].label, 'AC feed');
});

test('entry deletion protects cabling and bundle deletion intentionally removes its members', () => {
    assert.throws(
        () =>
            deleteLayoutObjects(layout(), [
                { type: 'cable_entry', id: 'entry-1' },
            ]),
        /Reassign or remove/,
    );
    const removed = deleteLayoutObjects(layout(), [
        { type: 'cable_bundle', id: 'bundle-1' },
    ]);
    assert.equal(removed.cable_entries.length, 1);
    assert.equal(removed.cable_bundles.length, 0);
    assert.equal(removed.external_cables.length, 0);
});

test('entry resizing rejects impossible spans and panel narrowing clamps offsets without losing anchors', () => {
    const original = layout();
    original.cable_entries[0].span_mm = 400;
    assert.throws(() => normalizePanelLayout(original), /span must fit/);
    const narrowed = layout();
    narrowed.cable_entries[0].offset_mm = 320;
    narrowed.design.width_mm = 250;
    const normalized = normalizePanelLayout(narrowed);
    assert.equal(normalized.cable_entries[0].offset_mm, 210);
    assert.deepEqual(
        normalized.cable_bundles[0].route_points[0],
        point(230, 320),
    );
});

test('internal route estimates count the shared trunk once per cable plus its individual branch', () => {
    const original = layout();
    assert.equal(
        externalCableLengthMm(original.external_cables[0], original),
        383,
    );
});

test('invalid origins and incomplete or unknown terminations cannot become editor snapshots', () => {
    const bothOrigins = layout();
    bothOrigins.external_cables[0].cable_entry_portable_id = 'entry-1';
    assert.throws(() => refreshExternalCabling(bothOrigins), /either a bundle/);
    const incomplete = layout();
    incomplete.external_cables[0].internal_terminal = null;
    assert.throws(() => refreshExternalCabling(incomplete), /both a component/);
    const unknown = layout();
    unknown.external_cables[0].internal_terminal = 'unknown';
    assert.throws(() => refreshExternalCabling(unknown), /Terminal unknown/);
});

test('autosave serializes the complete cabling graph and preserves a newer cable edit during a save', async () => {
    const original = layout();
    const first = layoutSnapshot(original);
    assert.deepEqual(
        JSON.parse(JSON.stringify(first)).external_cables,
        original.external_cables,
    );
    assert.equal('definitions' in first, false);
    const requests = [];
    let resolveFirst;
    const queue = new LightingSaveQueue(first, 2, {
        request: async (mutation) => {
            requests.push(mutation);

            if (requests.length === 1) {
                return new Promise((resolve) => {
                    resolveFirst = resolve;
                });
            }

            return {
                mutation_id: mutation.mutation_id,
                save_version: 4,
                updated_at: '2026-10-05T00:00:00Z',
            };
        },
        onState: () => {},
    });
    queue.update(first);
    const saving = queue.flush();
    const newer = structuredClone(original);
    newer.external_cables[0].label = 'AC Feed revised';
    queue.update(layoutSnapshot(newer));
    resolveFirst({
        mutation_id: requests[0].mutation_id,
        save_version: 3,
        updated_at: '2026-10-05T00:00:00Z',
    });
    await saving;
    assert.equal(requests[0].external_cables[0].label, 'AC feed');
    assert.equal(requests[1].external_cables[0].label, 'AC Feed revised');
    assert.deepEqual(requests[1].cable_entries, original.cable_entries);
    assert.deepEqual(requests[1].cable_bundles, original.cable_bundles);
    assert.equal(requests[1].base_version, 3);
    queue.dispose();
});
