import assert from 'node:assert/strict';
import test from 'node:test';
import {
    insertPanelRow,
    movePanelDevice,
    movePanelRow,
    normalizePanelLayout,
    panelRowItems,
    panelRowWidth,
    panelRowSpace,
    panelDevicePosition,
    placePanelDevice,
    removePanelRow,
    reorderPanelDevice,
} from '../../resources/js/components/lighting/panel-layout.ts';

function definition(id = 1, overrides = {}) {
    return {
        id,
        catalog_family_id: `family-${id}`,
        revision: 1,
        manufacturer: 'Sample',
        model: `DIN-${id}`,
        display_name: `Device ${id}`,
        category: 'din-relay',
        kind: 'component',
        sku: null,
        width_mm: 36,
        height_mm: 90,
        depth_mm: 60,
        din_modules: 2,
        mounting_type: 'din-rail',
        image_path: null,
        image_url: null,
        local_image_url: null,
        datasheet_url: null,
        description: null,
        terminals: [
            {
                key: 'P',
                label: 'Power',
                x_mm: 0,
                y_mm: 0,
                side: 'top',
                purpose: 'power',
            },
        ],
        metadata: {},
        mounting_anchor_x_mm: null,
        mounting_anchor_y_mm: null,
        archived_at: null,
        ...overrides,
    };
}

function row(id, sort_order = 0) {
    return {
        portable_id: id,
        sort_order,
        component_definition_id: null,
        x_mm: 90,
        y_mm: 400,
        length_mm: 100,
        width_mm: 20,
    };
}

function item(
    id,
    rowId = 'row-1',
    sort_order = 0,
    component_definition_id = 1,
) {
    return {
        portable_id: id,
        component_definition_id,
        rail_portable_id: rowId,
        sort_order,
        x_mm: 20 + sort_order * 90,
        y_mm: 400,
        rotation: 90,
        custom_label: `Label ${id}`,
        notes: 'Existing notes',
        metadata: { channel: 1 },
    };
}

function layout(overrides = {}) {
    return {
        design: {
            id: 1,
            name: 'Main lighting panel',
            width_mm: 364,
            height_mm: 800,
            depth_mm: 120,
            margin_top_mm: 20,
            margin_right_mm: 20,
            margin_bottom_mm: 20,
            margin_left_mm: 20,
            grid_size_mm: 5,
            snap_to_grid: true,
            notes: null,
            save_version: 4,
            updated_at: '2026-10-04T00:00:00Z',
        },
        definitions: [definition(), definition(2, { width_mm: 72 })],
        rails: [row('row-1'), row('row-2', 1)],
        components: [],
        ducts: [],
        connections: [],
        ...overrides,
    };
}

function rowIds(panel) {
    return panel.rails.map((rail) => rail.portable_id);
}

function itemIds(panel, rowId) {
    return panelRowItems(panel, rowId).map(
        (component) => component.portable_id,
    );
}

test('normalization orders devices by physical position and preserves intentional gaps on automatic rows', () => {
    const original = layout({
        rails: [row('row-2', 5), row('row-1', 2)],
        components: [
            { ...item('wide', 'row-1', 9, 2), x_mm: 180 },
            { ...item('narrow', 'row-1', 4), x_mm: 40 },
        ],
    });
    const before = structuredClone(original);

    const normalized = normalizePanelLayout(original);

    assert.deepEqual(rowIds(normalized), ['row-1', 'row-2']);
    assert.deepEqual(
        normalized.rails.map(
            ({ x_mm, y_mm, length_mm, width_mm, sort_order }) => ({
                x_mm,
                y_mm,
                length_mm,
                width_mm,
                sort_order,
            }),
        ),
        [
            {
                x_mm: 20,
                y_mm: 72.5,
                length_mm: 324,
                width_mm: 35,
                sort_order: 0,
            },
            {
                x_mm: 20,
                y_mm: 212.5,
                length_mm: 324,
                width_mm: 35,
                sort_order: 1,
            },
        ],
    );
    assert.deepEqual(
        panelRowItems(normalized, 'row-1').map(
            ({ portable_id, x_mm, y_mm, rotation, sort_order }) => ({
                portable_id,
                x_mm,
                y_mm,
                rotation,
                sort_order,
            }),
        ),
        [
            {
                portable_id: 'narrow',
                x_mm: 40,
                y_mm: 45,
                rotation: 0,
                sort_order: 0,
            },
            {
                portable_id: 'wide',
                x_mm: 180,
                y_mm: 45,
                rotation: 0,
                sort_order: 1,
            },
        ],
    );
    assert.equal(panelRowWidth(normalized, 'row-1'), 108);
    assert.equal(normalized.design.height_mm, 320);
    assert.equal(normalized.design.save_version, 4);
    assert.deepEqual(original, before);
});

test('automatic row pitch leaves clearance for tall devices with different mounting anchors', () => {
    const original = layout({
        definitions: [
            definition(1, { height_mm: 220, mounting_anchor_y_mm: 180 }),
            definition(2, { height_mm: 220, mounting_anchor_y_mm: 30 }),
        ],
        components: [item('top', 'row-1', 0), item('bottom', 'row-2', 0, 2)],
    });

    const normalized = normalizePanelLayout(original);

    assert.deepEqual(
        normalized.rails.map((rail) => rail.y_mm),
        [202.5, 612.5],
    );
    assert.equal(normalized.components[0].y_mm, 40);
    assert.equal(normalized.components[1].y_mm, 600);
    assert.equal(normalized.design.height_mm, 860);
});

test('adding rows above and below preserves neighbors and grows the enclosure automatically', () => {
    const original = normalizePanelLayout(layout());
    const before = structuredClone(original);

    const above = insertPanelRow(original, 'row-1', 'above');
    const addedAboveId = above.rails[0].portable_id;
    const both = insertPanelRow(above, 'row-1', 'below');
    const addedBelowId = both.rails[2].portable_id;

    assert.deepEqual(rowIds(both), [
        addedAboveId,
        'row-1',
        addedBelowId,
        'row-2',
    ]);
    assert.equal(above.design.height_mm, 460);
    assert.equal(both.design.height_mm, 600);
    assert.deepEqual(
        both.rails.map((rail) => rail.sort_order),
        [0, 1, 2, 3],
    );
    assert.deepEqual(original, before);
    assert.equal(removePanelRow(both, addedAboveId).design.height_mm, 460);
});

test('moving a row carries its device membership and recalculates aligned placement', () => {
    const original = normalizePanelLayout(
        layout({ components: [item('device', 'row-1')] }),
    );
    const before = structuredClone(original);

    const moved = movePanelRow(original, 'row-1', 1);

    assert.deepEqual(rowIds(moved), ['row-2', 'row-1']);
    assert.equal(moved.components[0].rail_portable_id, 'row-1');
    assert.equal(moved.components[0].y_mm, 185);
    assert.deepEqual(original, before);
    assert.equal(movePanelRow(moved, 'row-1', 1), moved);
    assert.equal(movePanelRow(moved, 'missing', -1), moved);
});

test('an occupied row cannot be removed and leaves its items and geometry intact', () => {
    const original = normalizePanelLayout(
        layout({ components: [item('device', 'row-1')] }),
    );
    const before = structuredClone(original);

    assert.throws(() => removePanelRow(original, 'row-1'), /Only empty rows/);
    assert.deepEqual(original, before);
    const removed = removePanelRow(original, 'row-2');
    assert.deepEqual(rowIds(removed), ['row-1']);
    assert.deepEqual(itemIds(removed, 'row-1'), ['device']);
    assert.equal(removed.design.height_mm, 180);
});

test('placing a shared catalog device uses the first fitting gap without moving neighbors', () => {
    const original = normalizePanelLayout(
        layout({ components: [item('first'), item('last', 'row-1', 1)] }),
    );
    const before = structuredClone(original);
    const catalogDevice = definition(3, { width_mm: 19 });

    const placed = placePanelDevice(original, catalogDevice, 'row-1');

    assert.deepEqual(placed.selection, {
        type: 'component',
        id: placed.layout.components.at(-1).portable_id,
    });
    assert.deepEqual(itemIds(placed.layout, 'row-1'), [
        'first',
        placed.selection.id,
        'last',
    ]);
    assert.deepEqual(
        panelRowItems(placed.layout, 'row-1').map(
            (component) => component.x_mm,
        ),
        [20, 56, 110],
    );
    assert.equal(placed.layout.definitions.at(-1).id, 3);
    assert.equal(placed.layout.components.at(-1).component_definition_id, 3);
    assert.equal(placed.layout.components[0].custom_label, 'Label first');
    assert.deepEqual(original, before);
});

test('move controls nudge a device physically without packing its neighbors or changing identity', () => {
    const original = normalizePanelLayout(
        layout({
            components: [
                item('first'),
                item('second', 'row-1', 1, 2),
                item('third', 'row-1', 2),
            ],
        }),
    );
    const before = structuredClone(original);

    const movedLeft = reorderPanelDevice(original, 'second', -1);
    const movedRight = reorderPanelDevice(movedLeft, 'second', 1);

    assert.deepEqual(itemIds(movedLeft, 'row-1'), ['first', 'second', 'third']);
    assert.deepEqual(
        panelRowItems(movedLeft, 'row-1').map((component) => component.x_mm),
        [20, 109, 200],
    );
    assert.deepEqual(
        panelRowItems(movedLeft, 'row-1').map(
            (component) => component.sort_order,
        ),
        [0, 1, 2],
    );
    assert.deepEqual(itemIds(movedRight, 'row-1'), [
        'first',
        'second',
        'third',
    ]);
    assert.equal(reorderPanelDevice(movedLeft, 'first', -1), movedLeft);
    assert.deepEqual(original, before);
});

test('moving a device between rows preserves its horizontal position and source gaps', () => {
    const original = normalizePanelLayout(
        layout({
            components: [
                item('first'),
                item('moving', 'row-1', 1, 2),
                item('last', 'row-1', 2),
                item('target', 'row-2'),
            ],
        }),
    );
    const before = structuredClone(original);

    const moved = movePanelDevice(original, 'moving', 'row-2');

    assert.deepEqual(itemIds(moved, 'row-1'), ['first', 'last']);
    assert.deepEqual(itemIds(moved, 'row-2'), ['target', 'moving']);
    assert.deepEqual(
        panelRowItems(moved, 'row-1').map((component) => component.x_mm),
        [20, 200],
    );
    assert.deepEqual(
        panelRowItems(moved, 'row-2').map((component) => component.x_mm),
        [20, 110],
    );
    assert.deepEqual(
        panelRowItems(moved, 'row-2').map((component) => component.sort_order),
        [0, 1],
    );
    assert.equal(panelRowItems(moved, 'row-2')[0].y_mm, 185);
    assert.deepEqual(original, before);
});

test('a device that exactly fills a row fits while overflowing additions and moves fail without changes', () => {
    const fullWidth = definition(3, { width_mm: 324 });
    const original = normalizePanelLayout(
        layout({
            definitions: [definition(), fullWidth],
            components: [item('full', 'row-1', 0, 3), item('moving', 'row-2')],
        }),
    );
    const before = structuredClone(original);

    assert.equal(panelRowWidth(original, 'row-1'), 324);
    assert.throws(
        () => placePanelDevice(original, definition(), 'row-1'),
        /Row 01 is full/,
    );
    assert.throws(
        () => movePanelDevice(original, 'moving', 'row-1'),
        /Row 01 is full/,
    );
    assert.deepEqual(original, before);
});

test('row placement rejects unsupported mounting types and missing row or device references', () => {
    const original = layout();

    assert.throws(
        () =>
            placePanelDevice(
                original,
                definition(3, { mounting_type: 'pcb' }),
                'row-1',
            ),
        /DIN-mounted/,
    );
    assert.throws(
        () =>
            placePanelDevice(
                original,
                definition(3, { kind: 'rail' }),
                'row-1',
            ),
        /DIN-mounted/,
    );
    assert.throws(
        () => placePanelDevice(original, definition(), 'missing'),
        /Add a row/,
    );
    assert.throws(
        () => movePanelDevice(original, 'missing', 'row-1'),
        /DIN-mounted/,
    );
    assert.throws(
        () => movePanelDevice(original, 'missing', 'missing'),
        /Choose a row/,
    );
    assert.throws(
        () =>
            normalizePanelLayout(
                layout({ components: [item('orphan', 'missing')] }),
            ),
        /Move the devices/,
    );
    assert.throws(
        () =>
            normalizePanelLayout(
                layout({ design: { ...original.design, width_mm: 40 } }),
            ),
        /Panel width/,
    );
});

test('normalization retains unassigned legacy devices and ducts without silently placing them on rows', () => {
    const legacyDevice = {
        ...item('legacy', null, 4, 3),
        x_mm: 210.5,
        y_mm: 300.75,
        rotation: 90,
    };
    const duct = { ...row('legacy-duct'), orientation: 'vertical' };
    const original = layout({
        definitions: [definition(), definition(3, { mounting_type: 'pcb' })],
        components: [item('mounted'), legacyDevice],
        ducts: [duct],
    });

    const normalized = normalizePanelLayout(original);

    assert.deepEqual(
        normalized.components.find(
            (component) => component.portable_id === 'legacy',
        ),
        { ...legacyDevice, sort_order: 0 },
    );
    assert.deepEqual(normalized.ducts, [duct]);
    assert.deepEqual(itemIds(normalized, 'row-1'), ['mounted']);
    assert.deepEqual(original.components[1], legacyDevice);
});

test('moving a wired device keeps connections and conductor data while updating terminal anchors', () => {
    const original = normalizePanelLayout(
        layout({
            components: [item('source'), item('target', 'row-2', 0, 2)],
            connections: [
                {
                    portable_id: 'connection',
                    source_portable_id: 'source',
                    source_terminal: 'P',
                    target_portable_id: 'target',
                    target_terminal: 'P',
                    cable_type: 'Power',
                    color: '#2563eb',
                    gauge: '1.5 mm²',
                    conductor_count: 1,
                    route_points: [
                        { x_mm: 20, y_mm: 45 },
                        { x_mm: 20, y_mm: 185 },
                    ],
                    actual_length_mm: 250,
                    notes: 'Existing conductor',
                },
            ],
        }),
    );
    const before = structuredClone(original);

    const moved = movePanelDevice(original, 'source', 'row-2');
    const connection = moved.connections[0];

    assert.equal(connection.portable_id, 'connection');
    assert.equal(connection.actual_length_mm, 250);
    assert.equal(connection.gauge, '1.5 mm²');
    assert.deepEqual(connection.route_points[0], { x_mm: 92, y_mm: 185 });
    assert.deepEqual(connection.route_points.at(-1), { x_mm: 20, y_mm: 185 });
    assert.ok(
        connection.route_points.every(
            (point, index, points) =>
                index === 0 ||
                point.x_mm === points[index - 1].x_mm ||
                point.y_mm === points[index - 1].y_mm,
        ),
    );
    assert.deepEqual(original, before);
});

test('a far-right first device leaves the left side available and gaps survive repeated normalization', () => {
    const original = normalizePanelLayout(
        layout({ components: [{ ...item('right'), x_mm: 308 }] }),
    );

    const placed = placePanelDevice(original, definition(), 'row-1');
    const reloaded = normalizePanelLayout(structuredClone(placed.layout));

    assert.deepEqual(
        panelRowItems(reloaded, 'row-1').map((component) => component.x_mm),
        [20, 308],
    );
    assert.deepEqual(panelRowSpace(reloaded, 'row-1'), {
        gaps: [{ start_mm: 56, end_mm: 308 }],
        total_free_mm: 252,
        largest_gap_mm: 252,
    });
    assert.equal(original.components[0].x_mm, 308);
});

test('moving rows selects the nearest valid gap when the original position is occupied', () => {
    const original = normalizePanelLayout(
        layout({
            components: [
                { ...item('moving', 'row-1', 0, 2), x_mm: 110 },
                { ...item('obstacle', 'row-2'), x_mm: 110 },
            ],
        }),
    );

    const moved = movePanelDevice(original, 'moving', 'row-2');

    assert.equal(moved.components[0].x_mm, 146);
    assert.equal(moved.components[1].x_mm, 110);
    assert.equal(panelDevicePosition(original, 'row-2', 72, 110), 146);
});

test('normalization rejects collisions and panel resizing that would invalidate persistent X', () => {
    const original = layout({
        components: [
            item('first'),
            { ...item('overlapping', 'row-1', 1), x_mm: 55.99 },
        ],
    });

    assert.throws(() => normalizePanelLayout(original), /cannot overlap/);
    assert.throws(
        () =>
            normalizePanelLayout(
                layout({ components: [{ ...item('outside'), x_mm: 309 }] }),
            ),
        /inside the usable rail/,
    );
    assert.equal(original.components[1].x_mm, 55.99);
});

test('normalization retains intentional route points verbatim when terminal endpoints already match', () => {
    const connection = {
        portable_id: 'wire',
        source_portable_id: 'source',
        source_terminal: 'P',
        target_portable_id: 'target',
        target_terminal: 'P',
        cable_type: 'Power',
        color: null,
        gauge: null,
        conductor_count: 1,
        actual_length_mm: null,
        notes: null,
        route_points: [
            { x_mm: 20, y_mm: 45 },
            { x_mm: 40, y_mm: 45 },
            { x_mm: 60, y_mm: 45 },
            { x_mm: 110, y_mm: 45 },
        ],
    };
    const original = layout({
        components: [item('source'), item('target', 'row-1', 1)],
        connections: [connection],
    });

    const normalized = normalizePanelLayout(original);

    assert.deepEqual(
        normalized.connections[0].route_points,
        connection.route_points,
    );
});

test('move controls stop at touching edges instead of jumping across a neighboring device', () => {
    const original = normalizePanelLayout(
        layout({
            components: [
                item('left'),
                { ...item('right', 'row-1', 1), x_mm: 56 },
            ],
        }),
    );

    assert.equal(reorderPanelDevice(original, 'left', 1), original);
    assert.equal(reorderPanelDevice(original, 'right', -1), original);
    assert.equal(
        reorderPanelDevice(original, 'right', 1).components[1].x_mm,
        57,
    );
});

test('one millimeter nudges retain fractional positions from physical device widths', () => {
    const original = normalizePanelLayout(
        layout({ components: [{ ...item('fractional'), x_mm: 25.2 }] }),
    );
    const moved = reorderPanelDevice(original, 'fractional', 1);

    assert.equal(moved.components[0].x_mm, 26.2);
    assert.equal(
        reorderPanelDevice(moved, 'fractional', -1).components[0].x_mm,
        25.2,
    );
    assert.equal(original.components[0].x_mm, 25.2);
});
