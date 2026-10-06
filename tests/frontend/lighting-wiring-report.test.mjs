import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWiringReport } from '../../resources/js/components/lighting/wiring-report.ts';
import { wiringDocument } from './lighting-wiring-fixture.mjs';

test('uses deterministic physical references independent of input array order', () => {
    const document = wiringDocument();
    const reordered = structuredClone(document);

    for (const group of [
        'catalog',
        'components',
        'rows',
        'connections',
        'cable_entries',
        'cable_bundles',
        'external_cables',
    ]) {
        reordered[group].reverse();
    }

    const first = buildWiringReport(document);
    const second = buildWiringReport(reordered);

    for (const [group, objectKey] of [
        ['devices', 'component'],
        ['wires', 'connection'],
        ['entries', 'entry'],
        ['bundles', 'bundle'],
        ['externalCables', 'cable'],
    ]) {
        assert.deepEqual(
            first[group].map((item) => [
                item.reference,
                item[objectKey].portable_id,
            ]),
            second[group].map((item) => [
                item.reference,
                item[objectKey].portable_id,
            ]),
        );
    }

    assert.equal(first.devices[0].reference, 'DEV-01');
    assert.equal(first.devices[1].reference, 'DEV-02');
    assert.equal(first.devices[2].reference, 'DEV-03');
    assert.equal(first.devices[2].rowReference, 'ROW-02');
    assert.deepEqual(
        first.devices.map((device) => device.terminals),
        second.devices.map((device) => device.terminals),
    );
});

test('keeps the captured report independent of subsequent editor mutations', () => {
    const document = wiringDocument();

    const report = buildWiringReport(document);
    document.design.name = 'New live name';
    document.components[0].custom_label = 'A later edit';
    document.connections[0].route_points[0].x_mm = 999;

    assert.equal(report.name, 'Main Lighting - Café');
    assert.equal(
        report.devices[0].component.custom_label,
        'Living Room - Café lighting',
    );
    assert.equal(report.wires[0].connection.route_points[0].x_mm, 32);
    assert.equal(report.filename, 'main-lighting-cafe-wiring.pdf');
});

test('uses the same device and wire references in schedules, endpoints and terminal mappings', () => {
    const document = wiringDocument();

    const report = buildWiringReport(document);

    const line = report.devices[0].terminals.find(
        (terminal) => terminal.key === 'L',
    );
    const targetLine = report.devices[1].terminals.find(
        (terminal) => terminal.key === 'L',
    );
    assert.deepEqual(
        line.routes.map((route) => route.reference),
        ['W-001', 'W-002', 'W-003'],
    );
    assert.deepEqual(
        targetLine.routes.map((route) => route.reference),
        ['W-001', 'W-002', 'W-003'],
    );
    assert.equal(line.routes[0].connectedTo, 'DEV-02 L - Dining chandelier');
    assert.equal(
        targetLine.routes[0].connectedTo,
        'DEV-01 L - Living Room - Café lighting',
    );
    assert.deepEqual(
        report.wires.map((wire) => [wire.from.reference, wire.to.reference]),
        [
            ['DEV-01', 'DEV-02'],
            ['DEV-01', 'DEV-02'],
            ['DEV-01', 'DEV-02'],
        ],
    );
    assert.equal(report.wires[0].panelLengthMm, 380);
    assert.equal(report.wires[0].connection.actual_length_mm, 500);
    assert.deepEqual(
        report.devices[0].terminals.find((terminal) => terminal.key === 'SW1')
            .routes,
        [],
    );
});

test('includes field cables, bundle inheritance, unassigned runs and incomplete planned counts', () => {
    const document = wiringDocument();

    const report = buildWiringReport(document);

    const living = report.externalCables.find(
        (cable) => cable.cable.label === 'Living ceiling',
    );
    const pending = report.externalCables.find((cable) => !cable.termination);
    assert.equal(living.cableClass, 'line_voltage');
    assert.equal(living.direction, 'outgoing');
    assert.equal(living.bundleReference, 'BND-01');
    assert.equal(living.entryReference, 'ENT-01');
    assert.equal(living.panelLengthMm, 413);
    assert.equal(living.termination.reference, 'DEV-01');
    assert.equal(living.termination.terminal, 'O1');
    assert.equal(pending.panelLengthMm, null);
    assert.equal(pending.termination, null);
    assert.equal(report.bundles[0].definedCount, 3);
    assert.equal(report.bundles[0].unassignedCount, 1);
    assert.equal(report.bundles[0].missingPlannedCount, 2);
    assert.equal(report.entries[0].entry.label, 'Top field entry');
    assert.deepEqual(report.entries[0].point, { x_mm: 260, y_mm: 0 });
    assert.equal(report.incomplete.unassignedCables, 1);
    assert.equal(report.incomplete.plannedCablesMissing, 2);
    assert.equal(report.incomplete.spareTerminals, 10);
    assert.equal(
        report.devices[0].terminals.find((terminal) => terminal.key === 'O1')
            .routes[0].reference,
        living.reference,
    );
});

test('groups panel route totals by scope, cable type, gauge, conductors and class without inventing building lengths', () => {
    const document = wiringDocument();

    const report = buildWiringReport(document);

    const wire = report.materials.find(
        (material) => material.scope === 'Internal wire',
    );
    const field = report.materials.find(
        (material) => material.cableType === '14/2 with ground',
    );
    assert.equal(wire.runs, 3);
    assert.equal(wire.routedRuns, 3);
    assert.equal(wire.panelLengthMm, 1140);
    assert.equal(field.runs, 3);
    assert.equal(field.routedRuns, 2);
    assert.equal(field.panelLengthMm, 686);
    assert.equal(field.conductorCount, 3);
    assert.equal(field.gauge, '14 AWG');
    assert.equal(field.cableClass, 'line_voltage');
    assert.equal(report.equipment[0].quantity, 3);
    assert.equal('buildingLengthMm' in field, false);
});

test('separates material groups when conductor count or cable class differs', () => {
    const document = wiringDocument();
    document.external_cables[1].conductor_count = 2;

    const report = buildWiringReport(document);

    assert.equal(
        report.materials.filter(
            (material) => material.cableType === '14/2 with ground',
        ).length,
        2,
    );
});

test('handles an empty design and rejects missing catalog definitions', () => {
    const document = wiringDocument();

    for (const group of [
        'catalog',
        'rows',
        'components',
        'ducts',
        'connections',
        'cable_entries',
        'cable_bundles',
        'external_cables',
    ]) {
        document[group] = [];
    }

    const report = buildWiringReport(document);

    assert.equal(report.devices.length, 0);
    assert.equal(report.materials.length, 0);
    assert.equal(report.incomplete.spareTerminals, 0);
    const broken = wiringDocument();
    broken.catalog = [];
    assert.throws(
        () => buildWiringReport(broken),
        /missing a catalog definition/,
    );
});
