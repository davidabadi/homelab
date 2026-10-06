import assert from 'node:assert/strict';
import test from 'node:test';
import {
    describeLightingRoute,
    getTerminalConnections,
    terminalConnectionSummary,
} from '../../resources/js/components/lighting/connection-lookup.ts';

function layout() {
    return {
        definitions: [
            {
                id: 1,
                display_name: 'Controller',
                terminals: [
                    { key: 'out-key', label: 'O1' },
                    { key: 'neutral-key', label: 'N' },
                    { key: 'spare-key', label: 'SW1' },
                ],
            },
        ],
        components: [
            {
                portable_id: 'controller',
                component_definition_id: 1,
                custom_label: 'Living room dimmer',
            },
            {
                portable_id: 'supply',
                component_definition_id: 1,
                custom_label: null,
            },
        ],
        connections: [
            {
                portable_id: 'wire-1',
                source_portable_id: 'controller',
                source_terminal: 'out-key',
                target_portable_id: 'supply',
                target_terminal: 'neutral-key',
                cable_type: 'Neutral jumper',
                gauge: '14 AWG',
            },
        ],
        cable_entries: [{ portable_id: 'entry-1', label: 'Top right' }],
        cable_bundles: [
            {
                portable_id: 'bundle-1',
                cable_entry_portable_id: 'entry-1',
                name: 'Lighting circuits',
                external_location: 'Living room',
                cable_class: 'line_voltage',
            },
        ],
        external_cables: [
            {
                portable_id: 'field-1',
                bundle_portable_id: 'bundle-1',
                cable_entry_portable_id: null,
                label: 'Living ceiling',
                cable_type: 'NM-B 14/2',
                gauge: '14 AWG',
                cable_class: null,
                internal_component_portable_id: 'controller',
                internal_terminal: 'neutral-key',
            },
        ],
    };
}

test('unconnected terminals remain informative and cannot select a route', () => {
    const routes = getTerminalConnections(layout(), 'controller', 'spare-key');

    assert.deepEqual(routes, []);
    assert.deepEqual(terminalConnectionSummary(routes), {
        status: 'unconnected',
        label: 'Not connected',
        selection: null,
    });
});

test('internal source terminals select the actual wire using its terminal key', () => {
    const routes = getTerminalConnections(layout(), 'controller', 'out-key');

    assert.equal(routes.length, 1);
    assert.deepEqual(terminalConnectionSummary(routes), {
        status: 'internal',
        label: 'Neutral jumper',
        selection: { type: 'connection', id: 'wire-1' },
    });
    assert.deepEqual(routes[0].endpoints, {
        source: 'Living room dimmer · O1 (out-key)',
        target: 'Controller · N (neutral-key)',
    });
    assert.deepEqual(getTerminalConnections(layout(), 'controller', 'O1'), []);
});

test('internal target terminals find the same wire as their source', () => {
    const routes = getTerminalConnections(layout(), 'supply', 'neutral-key');

    assert.deepEqual(
        routes.map((route) => route.selection),
        [{ type: 'connection', id: 'wire-1' }],
    );
    assert.deepEqual(
        getTerminalConnections(layout(), 'controller', 'neutral-key').map(
            (route) => route.selection,
        ),
        [{ type: 'external_cable', id: 'field-1' }],
    );
});

test('external terminal navigation returns the field cable and inherits bundle classification', () => {
    const original = layout();
    original.external_cables[0].cable_class = 'data';

    const routes = getTerminalConnections(
        original,
        'controller',
        'neutral-key',
    );

    assert.deepEqual(terminalConnectionSummary(routes), {
        status: 'field',
        label: 'Living ceiling',
        selection: { type: 'external_cable', id: 'field-1' },
    });
    assert.equal(routes[0].cableClass, 'line_voltage');
    assert.equal(routes[0].inheritedCableClass, true);
    assert.equal(routes[0].endpoints.source, 'Living room');
    assert.equal(
        routes[0].endpoints.target,
        'Living room dimmer · N (neutral-key)',
    );
    assert.equal(original.external_cables[0].cable_class, 'data');
});

test('multiple internal and field connections ask for a choice instead of picking the first', () => {
    const original = layout();
    original.external_cables[0].internal_terminal = 'out-key';
    original.connections.push({
        ...original.connections[0],
        portable_id: 'wire-2',
        source_portable_id: 'supply',
        source_terminal: 'neutral-key',
        target_portable_id: 'controller',
        target_terminal: 'out-key',
    });

    const routes = getTerminalConnections(original, 'controller', 'out-key');

    assert.deepEqual(
        routes.map((route) => route.selection),
        [
            { type: 'connection', id: 'wire-1' },
            { type: 'connection', id: 'wire-2' },
            { type: 'external_cable', id: 'field-1' },
        ],
    );
    assert.deepEqual(terminalConnectionSummary(routes), {
        status: 'multiple',
        label: '3 connections',
        selection: null,
    });
});

test('a wire that touches the same terminal at both ends appears once', () => {
    const original = layout();
    original.connections[0].target_portable_id = 'controller';
    original.connections[0].target_terminal = 'out-key';

    const routes = getTerminalConnections(original, 'controller', 'out-key');

    assert.equal(routes.length, 1);
    assert.deepEqual(routes[0].selection, { type: 'connection', id: 'wire-1' });
});

test('terminals with repeated display labels remain identifiable by their keys', () => {
    const original = layout();
    original.definitions[0].terminals = [
        { key: 'L1', label: 'L' },
        { key: 'L2', label: 'L' },
    ];
    original.connections[0].source_terminal = 'L1';
    original.connections[0].target_terminal = 'L2';

    const route = describeLightingRoute(original, {
        type: 'connection',
        id: 'wire-1',
    });

    assert.equal(route.endpoints.source, 'Living room dimmer · L (L1)');
    assert.equal(route.endpoints.target, 'Controller · L (L2)');
});

test('standalone and unassigned field routes retain useful metadata without a bundle', () => {
    const original = layout();
    Object.assign(original.external_cables[0], {
        bundle_portable_id: null,
        cable_entry_portable_id: 'entry-1',
        cable_class: 'data',
        internal_component_portable_id: null,
        internal_terminal: null,
    });

    const route = describeLightingRoute(original, {
        type: 'external_cable',
        id: 'field-1',
    });

    assert.equal(route.cableClass, 'data');
    assert.equal(route.inheritedCableClass, false);
    assert.equal(route.endpoints.source, 'Top right');
    assert.equal(route.endpoints.target, 'Unassigned terminal');
    assert.deepEqual(
        getTerminalConnections(original, 'controller', 'neutral-key'),
        [],
    );
});

test('bundle descriptions identify the shared trunk and unavailable routes are ignored', () => {
    const original = layout();

    const route = describeLightingRoute(original, {
        type: 'cable_bundle',
        id: 'bundle-1',
    });

    assert.equal(route.label, 'Lighting circuits');
    assert.equal(route.type, 'Shared trunk');
    assert.equal(route.endpoints.target, '1 field cable · bundle breakout');
    assert.equal(
        describeLightingRoute(original, {
            type: 'component',
            id: 'controller',
        }),
        null,
    );
    assert.equal(
        describeLightingRoute(original, { type: 'connection', id: 'missing' }),
        null,
    );
});
