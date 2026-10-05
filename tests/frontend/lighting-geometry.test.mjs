import assert from 'node:assert/strict';
import test from 'node:test';
import {
    addRouteDogleg,
    cableLengthMm,
    canvasPointToMm,
    canvasToMm,
    componentBounds,
    createOrthogonalRoute,
    mmPointToCanvas,
    mmToCanvas,
    moveLayoutObject,
    moveRouteBend,
    moveRouteSegment,
    normalizeOrthogonalRoute,
    outsideBounds,
    removeRouteBend,
    reconcileRailAttachments,
    rotatedBounds,
    snapComponentToRail,
    snapPoint,
    snapToGrid,
    terminalPoint,
    updateRouteEndpoints,
} from '../../resources/js/components/lighting/geometry.ts';

const point = (x_mm, y_mm) => ({ x_mm, y_mm });
const definition = {
    id: 1,
    catalog_family_id: 'catalog-1',
    revision: 1,
    manufacturer: 'Sample',
    model: 'DIN-72',
    display_name: 'Sample DIN device',
    category: 'controller',
    kind: 'component',
    sku: null,
    width_mm: 72,
    height_mm: 90,
    depth_mm: 60,
    din_modules: 4,
    mounting_type: 'din-rail',
    image_path: null,
    image_url: null,
    local_image_url: null,
    datasheet_url: null,
    description: null,
    terminals: [
        {
            key: 'GND',
            label: 'GND',
            ...point(0, 45),
            side: 'left',
            purpose: 'ground',
        },
    ],
    metadata: {},
    mounting_anchor_x_mm: 36,
    mounting_anchor_y_mm: 45,
    archived_at: null,
};
const component = {
    portable_id: 'device-1',
    component_definition_id: 1,
    ...point(50, 72.5),
    rotation: 0,
    custom_label: null,
    rail_portable_id: 'rail-1',
    notes: null,
    metadata: {},
};
const target = {
    ...component,
    portable_id: 'device-2',
    ...point(200, 200),
    rail_portable_id: null,
};
const rail = {
    portable_id: 'rail-1',
    component_definition_id: null,
    ...point(20, 100),
    length_mm: 400,
    width_mm: 35,
};

function layout() {
    return {
        design: {
            id: 1,
            name: 'Panel',
            width_mm: 600,
            height_mm: 800,
            depth_mm: null,
            margin_top_mm: 20,
            margin_right_mm: 20,
            margin_bottom_mm: 20,
            margin_left_mm: 20,
            grid_size_mm: 5,
            snap_to_grid: true,
            notes: null,
            save_version: 1,
            updated_at: '2026-10-04T12:00:00Z',
        },
        definitions: [definition],
        components: [component, target],
        rails: [rail],
        ducts: [],
        connections: [
            {
                portable_id: 'wire-1',
                source_portable_id: 'device-1',
                source_terminal: 'GND',
                target_portable_id: 'device-2',
                target_terminal: 'GND',
                cable_type: 'Wire',
                color: null,
                gauge: null,
                conductor_count: 1,
                actual_length_mm: null,
                notes: null,
                route_points: createOrthogonalRoute(
                    point(50, 117.5),
                    point(200, 245),
                ),
            },
        ],
        cable_entries: [],
        cable_bundles: [],
        external_cables: [],
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

test('millimeter conversions preserve fractional physical values at multiple render scales', () => {
    for (const scale of [0.5, 4, 12]) {
        assert.equal(canvasToMm(mmToCanvas(72.125, scale), scale), 72.125);
        assert.deepEqual(
            canvasPointToMm(
                mmPointToCanvas(point(-12.5, 215.75), scale),
                scale,
            ),
            point(-12.5, 215.75),
        );
    }

    assert.equal(mmToCanvas(72) / mmToCanvas(36), 2);
});

test('viewport zoom does not change the physical coordinates saved from canvas space', () => {
    const physical = point(125, 75);
    const canvas = mmPointToCanvas(physical);

    for (const zoom of [0.2, 1, 2.5]) {
        const screen = { x: canvas.x * zoom + 120, y: canvas.y * zoom + 30 };
        const flow = { x: (screen.x - 120) / zoom, y: (screen.y - 30) / zoom };
        assert.deepEqual(canvasPointToMm(flow), physical);
    }
});

test('grid snapping handles negative coordinates custom intervals and disabled snapping', () => {
    assert.deepEqual(snapPoint(point(12, 18), 5), point(10, 20));
    assert.deepEqual(snapPoint(point(-12, 18), 2), point(-12, 18));
    assert.equal(snapToGrid(12.4, 0.5), 12.5);
    assert.equal(snapToGrid(12.4, 0), 12.4);
});

test('right-angle rotation preserves device dimensions and terminal positions', () => {
    assert.deepEqual(rotatedBounds(72, 90, 90), { width: 90, height: 72 });
    assert.deepEqual(
        componentBounds(
            { ...component, ...point(10, 20), rotation: 90 },
            definition,
        ),
        { ...point(10, 20), width: 90, height: 72 },
    );
    assert.deepEqual(
        terminalPoint(
            { ...component, ...point(10, 20), rotation: 90 },
            definition,
            'GND',
        ),
        point(55, 20),
    );
    assert.deepEqual(
        terminalPoint(
            { ...component, ...point(10, 20), rotation: 180 },
            definition,
            'GND',
        ),
        point(82, 65),
    );
    assert.deepEqual(
        terminalPoint(
            { ...component, ...point(10, 20), rotation: 270 },
            definition,
            'GND',
        ),
        point(55, 92),
    );
});

test('cable estimates sum real orthogonal segments and retain deliberate return runs', () => {
    assert.equal(
        cableLengthMm([
            point(0, 0),
            point(100, 0),
            point(100, 250),
            point(50, 250),
        ]),
        400,
    );
    assert.equal(cableLengthMm([]), 0);
    assert.equal(cableLengthMm([point(1, 1)]), 0);
    const serviceReturn = normalizeOrthogonalRoute([
        point(0, 0),
        point(100, 0),
        point(40, 0),
    ]);
    assert.equal(cableLengthMm(serviceReturn), 160);
});

test('routes normalize diagonal input and redundant bends without moving endpoints', () => {
    const route = normalizeOrthogonalRoute([
        point(0, 0),
        point(0, 0),
        point(10, 10),
        point(30, 10),
    ]);
    assertOrthogonal(route);
    assert.deepEqual(route[0], point(0, 0));
    assert.deepEqual(route.at(-1), point(30, 10));
    assert.equal(cableLengthMm(route), 40);
});

test('coincident endpoints retain two anchors and a zero cable estimate', () => {
    const route = createOrthogonalRoute(point(100, 200), point(100, 200));
    assert.deepEqual(route, [point(100, 200), point(100, 200)]);
    assert.equal(cableLengthMm(route), 0);
    const moved = updateRouteEndpoints(route, point(110, 200), point(100, 200));
    assert.deepEqual(moved, [point(110, 200), point(100, 200)]);
});

test('moving endpoints keeps manually routed middle segments orthogonal', () => {
    const route = [point(0, 0), point(40, 0), point(40, 100), point(200, 100)];
    const moved = updateRouteEndpoints(route, point(10, 20), point(220, 130));
    assertOrthogonal(moved);
    assert.deepEqual(moved[0], point(10, 20));
    assert.deepEqual(moved.at(-1), point(220, 130));
    assert.equal(moved[1].x_mm, 40);
});

test('manual segment bend and dogleg edits preserve terminal anchors', () => {
    const straight = [point(0, 0), point(90, 0)];
    const dogleg = addRouteDogleg(straight, 0, 10);
    assert.equal(cableLengthMm(dogleg), 110);
    const segment = moveRouteSegment(straight, 0, point(45, 20));
    assert.deepEqual(segment[0], straight[0]);
    assert.deepEqual(segment.at(-1), straight.at(-1));
    assertOrthogonal(segment);
    const bend = moveRouteBend(dogleg, 2, point(35, 15));
    assertOrthogonal(bend);
    assert.deepEqual(bend[0], straight[0]);
    assert.deepEqual(bend.at(-1), straight.at(-1));
    const removed = removeRouteBend(dogleg, 2);
    assertOrthogonal(removed);
    assert.deepEqual(removed[0], straight[0]);
    assert.deepEqual(removed.at(-1), straight.at(-1));
    assert.ok(removed.length < dogleg.length);
    assert.ok(cableLengthMm(removed) < cableLengthMm(dogleg));
});

test('DIN attachment uses the mounting anchor with a five millimeter tolerance', () => {
    const snapped = snapComponentToRail(
        { ...component, ...point(60, 75) },
        definition,
        layout(),
    );
    assert.equal(snapped.y_mm, 72.5);
    assert.equal(snapped.rail_portable_id, 'rail-1');
    assert.equal(
        snapComponentToRail({ ...component, y_mm: 85 }, definition, layout())
            .rail_portable_id,
        null,
    );
    assert.equal(
        snapComponentToRail({ ...component, x_mm: 410 }, definition, layout())
            .rail_portable_id,
        null,
    );
    assert.equal(
        snapComponentToRail(
            { ...component, rotation: 90 },
            definition,
            layout(),
        ).rail_portable_id,
        null,
    );
});

test('moving a DIN rail moves attached devices and updates wire endpoint coordinates', () => {
    const initial = layout();
    const moved = moveLayoutObject(
        initial,
        { type: 'rail', id: 'rail-1' },
        point(40, 120),
    );
    assert.deepEqual(
        { x_mm: moved.components[0].x_mm, y_mm: moved.components[0].y_mm },
        point(70, 92.5),
    );
    assert.deepEqual(moved.connections[0].route_points[0], point(70, 137.5));
    assert.deepEqual(moved.connections[0].route_points.at(-1), point(200, 245));
    assertOrthogonal(moved.connections[0].route_points);
    assert.equal(initial.components[0].x_mm, 50);
    assert.equal(moved.components[1].x_mm, 200);
});

test('moving a device snaps to a custom grid and detaches when pulled away from its rail', () => {
    const moved = moveLayoutObject(
        layout(),
        { type: 'component', id: 'device-1' },
        point(43, 180),
    );
    assert.equal(moved.components[0].x_mm, 45);
    assert.equal(moved.components[0].rail_portable_id, null);
    assert.deepEqual(moved.connections[0].route_points[0], point(45, 225));
});

test('usable enclosure bounds account for all four distinct margins', () => {
    const enclosure = {
        width_mm: 600,
        height_mm: 800,
        margin_left_mm: 10,
        margin_right_mm: 20,
        margin_top_mm: 30,
        margin_bottom_mm: 40,
    };
    assert.equal(
        outsideBounds({ ...point(10, 30), width: 570, height: 730 }, enclosure),
        false,
    );
    assert.equal(
        outsideBounds({ ...point(9, 30), width: 50, height: 50 }, enclosure),
        true,
    );
    assert.equal(
        outsideBounds({ ...point(570, 750), width: 20, height: 20 }, enclosure),
        true,
    );
});

test('rail width edits realign mounting anchors and shortened rails detach overflowing devices', () => {
    const initial = layout();
    const wider = reconcileRailAttachments({
        ...initial,
        rails: [{ ...rail, width_mm: 55 }],
    });
    assert.equal(wider.components[0].y_mm, 82.5);
    assert.equal(wider.components[0].rail_portable_id, 'rail-1');
    const shorter = reconcileRailAttachments({
        ...initial,
        rails: [{ ...rail, length_mm: 80 }],
    });
    assert.equal(shorter.components[0].rail_portable_id, null);
    const rotated = reconcileRailAttachments({
        ...initial,
        components: [{ ...component, rotation: 90 }, target],
    });
    assert.equal(rotated.components[0].rail_portable_id, null);
});
