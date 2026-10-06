import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildWiringRoutes,
    findRoutesNearPoint,
    pointToSegmentDistanceMm,
    screenToleranceMm,
} from '../../resources/js/components/lighting/route-hit-testing.ts';
import { findRouteOverlaps } from '../../resources/js/components/lighting/route-overlap.ts';

const point = (x_mm, y_mm) => ({ x_mm, y_mm });
const selection = (id, type = 'connection') => ({ type, id });
const route = (id, points, type = 'connection') => ({
    selection: selection(id, type),
    paths: [points],
    countable: true,
});

function layout() {
    return {
        connections: [
            {
                portable_id: 'wire-1',
                route_points: [point(0, 40), point(100, 40)],
            },
        ],
        cable_bundles: [
            {
                portable_id: 'bundle-1',
                route_points: [point(50, 0), point(50, 30)],
            },
        ],
        external_cables: [
            {
                portable_id: 'field-1',
                bundle_portable_id: 'bundle-1',
                branch_route_points: [point(50, 30), point(50, 80)],
            },
            {
                portable_id: 'unassigned',
                bundle_portable_id: 'bundle-1',
                branch_route_points: [],
            },
            {
                portable_id: 'standalone',
                bundle_portable_id: null,
                branch_route_points: [point(75, 0), point(75, 100)],
            },
        ],
    };
}

test('route hits use the nearest point on horizontal and vertical segments', () => {
    const routes = [
        route('horizontal', [point(0, 10), point(100, 10)]),
        route('vertical', [point(200, 0), point(200, 100)]),
    ];
    assert.deepEqual(findRoutesNearPoint(routes, point(40, 12), 2), [
        selection('horizontal'),
    ]);
    assert.deepEqual(findRoutesNearPoint(routes, point(198, 40), 2), [
        selection('vertical'),
    ]);
    assert.deepEqual(findRoutesNearPoint(routes, point(40, 12.01), 2), []);
    assert.deepEqual(findRoutesNearPoint(routes, point(202.01, 40), 2), []);
});

test('route hits clamp to actual endpoints instead of extending infinite lines', () => {
    const routes = [route('wire', [point(0, 0), point(10, 0)])];
    assert.deepEqual(findRoutesNearPoint(routes, point(11, 0), 1), [
        selection('wire'),
    ]);
    assert.deepEqual(findRoutesNearPoint(routes, point(12, 0), 1), []);
    assert.equal(
        pointToSegmentDistanceMm(point(13, 4), point(0, 0), point(10, 0)),
        5,
    );
});

test('two identical routes and a third partial overlap remain independently hittable', () => {
    const routes = [
        route('wire-1', [point(0, 0), point(100, 0)]),
        route('wire-2', [point(100, 0), point(0, 0)]),
        route('field-1', [point(30, 0), point(70, 0)], 'external_cable'),
    ];
    assert.equal(findRoutesNearPoint(routes, point(50, 0), 1).length, 3);
    assert.equal(findRoutesNearPoint(routes, point(20, 0), 1).length, 2);
    assert.equal(findRoutesNearPoint(routes, point(102, 0), 1).length, 0);
});

test('hit candidates deduplicate an elbow and multiple paths belonging to one cable', () => {
    const routes = [
        {
            ...route(
                'field-1',
                [point(0, 0), point(50, 0), point(50, 50)],
                'external_cable',
            ),
            paths: [
                [point(0, 0), point(50, 0)],
                [point(50, 0), point(50, 50), point(0, 50), point(0, 0)],
            ],
        },
    ];
    assert.deepEqual(findRoutesNearPoint(routes, point(50, 0), 5), [
        selection('field-1', 'external_cable'),
    ]);
    assert.deepEqual(
        findRoutesNearPoint([...routes, ...routes], point(0, 0), 5),
        [selection('field-1', 'external_cable')],
    );
});

test('screen tolerance remains comfortable at every zoom without changing route geometry', () => {
    const routes = [route('wire', [point(0, 0), point(1000, 0)])];
    const original = structuredClone(routes);

    for (const zoom of [0.08, 0.5, 1, 4]) {
        const inside = point(50, 9 / (4 * zoom));
        const outside = point(50, 11 / (4 * zoom));
        assert.equal(
            findRoutesNearPoint(routes, inside, screenToleranceMm(10, zoom))
                .length,
            1,
        );
        assert.equal(
            findRoutesNearPoint(routes, outside, screenToleranceMm(10, zoom))
                .length,
            0,
        );
    }

    assert.deepEqual(routes, original);
});

test('shared trunk hits expose both its bundle and all defined members including unassigned cables', () => {
    const routes = buildWiringRoutes(layout());
    assert.deepEqual(findRoutesNearPoint(routes, point(50, 10), 1), [
        selection('field-1', 'external_cable'),
        selection('unassigned', 'external_cable'),
        selection('bundle-1', 'cable_bundle'),
    ]);
    assert.deepEqual(findRoutesNearPoint(routes, point(50, 60), 1), [
        selection('field-1', 'external_cable'),
    ]);
    assert.deepEqual(findRoutesNearPoint(routes, point(75, 60), 1), [
        selection('standalone', 'external_cable'),
    ]);
});

test('hidden wiring layers never contribute candidates or overlap counts', () => {
    const internal = buildWiringRoutes(layout(), {
        internal: true,
        external: false,
    });
    const external = buildWiringRoutes(layout(), {
        internal: false,
        external: true,
    });
    assert.deepEqual(findRoutesNearPoint(internal, point(50, 10), 1), []);
    assert.equal(findRoutesNearPoint(external, point(20, 40), 1).length, 0);
    assert.deepEqual(
        buildWiringRoutes(layout(), { internal: false, external: false }),
        [],
    );
});

test('overlap spans split where the number of physical cables changes', () => {
    const routes = [
        route('wire-1', [point(0, 10), point(100, 10)]),
        route('wire-2', [point(10, 10), point(90, 10)]),
        route('wire-3', [point(25, 10), point(75, 10)]),
    ];
    assert.deepEqual(
        findRouteOverlaps(routes).map(({ start, end, selections }) => [
            start.x_mm,
            end.x_mm,
            selections.length,
        ]),
        [
            [10, 25, 2],
            [25, 75, 3],
            [75, 90, 2],
        ],
    );
});

test('overlap spans cover vertical reversed routes and merge consecutive equivalent membership', () => {
    const routes = [
        route('wire-1', [point(20, 0), point(20, 100)]),
        route('wire-2', [point(20, 100), point(20, 50), point(20, 0)]),
    ];
    assert.deepEqual(findRouteOverlaps(routes), [
        {
            start: point(20, 0),
            end: point(20, 100),
            selections: [selection('wire-1'), selection('wire-2')],
        },
    ]);
});

test('perpendicular crossings, touching endpoints and a self-retracing route do not imply shared spans', () => {
    const crossing = [
        route('horizontal', [point(0, 50), point(100, 50)]),
        route('vertical', [point(50, 0), point(50, 100)]),
    ];
    assert.deepEqual(findRouteOverlaps(crossing), []);
    assert.equal(findRoutesNearPoint(crossing, point(50, 50), 1).length, 2);
    assert.deepEqual(
        findRouteOverlaps([
            route('wire-1', [point(0, 0), point(10, 0)]),
            route('wire-2', [point(10, 0), point(20, 0)]),
        ]),
        [],
    );
    assert.deepEqual(
        findRouteOverlaps([
            route('wire-1', [point(0, 0), point(10, 0), point(0, 0)]),
        ]),
        [],
    );
});

test('shared trunk indicator counts member cables once and excludes the structural bundle', () => {
    const original = layout();
    const before = structuredClone(original);
    const overlaps = findRouteOverlaps(buildWiringRoutes(original));
    assert.deepEqual(overlaps, [
        {
            start: point(50, 0),
            end: point(50, 30),
            selections: [
                selection('field-1', 'external_cable'),
                selection('unassigned', 'external_cable'),
            ],
        },
    ]);
    assert.deepEqual(original, before);
});
