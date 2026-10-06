import type {
    CableClass,
    LightingLayout,
    LightingSelection,
    TerminalDefinition,
} from './types';

export type LightingRouteSelection = {
    type: 'connection' | 'external_cable' | 'cable_bundle';
    id: string;
};

export type RouteDescription = {
    selection: LightingRouteSelection;
    label: string;
    endpoints: { source: string; target: string };
    type: string;
    gauge: string | null;
    cableClass: CableClass | null;
    inheritedCableClass: boolean;
};

export function terminalDisplayLabel(terminal: TerminalDefinition): string {
    return terminal.label === terminal.key
        ? terminal.label
        : `${terminal.label} (${terminal.key})`;
}

export function terminalEndpointLabel(
    layout: LightingLayout,
    componentId: string,
    terminalKey: string,
): string {
    const component = layout.components.find(
        (item) => item.portable_id === componentId,
    );
    const definition = layout.definitions.find(
        (item) => item.id === component?.component_definition_id,
    );
    const terminal = definition?.terminals.find(
        (item) => item.key === terminalKey,
    );

    return `${component?.custom_label || definition?.display_name || componentId} · ${terminal ? terminalDisplayLabel(terminal) : terminalKey}`;
}

export function describeLightingRoute(
    layout: LightingLayout,
    selection: NonNullable<LightingSelection>,
): RouteDescription | null {
    if (selection.type === 'connection') {
        const connection = layout.connections.find(
            (item) => item.portable_id === selection.id,
        );

        if (!connection) {
            return null;
        }

        return {
            selection: { type: 'connection', id: connection.portable_id },
            label: connection.cable_type || 'Internal wire',
            endpoints: {
                source: terminalEndpointLabel(
                    layout,
                    connection.source_portable_id,
                    connection.source_terminal,
                ),
                target: terminalEndpointLabel(
                    layout,
                    connection.target_portable_id,
                    connection.target_terminal,
                ),
            },
            type: connection.cable_type || 'Unspecified wire type',
            gauge: connection.gauge,
            cableClass: null,
            inheritedCableClass: false,
        };
    }

    if (selection.type === 'external_cable') {
        const cable = layout.external_cables.find(
            (item) => item.portable_id === selection.id,
        );

        if (!cable) {
            return null;
        }

        const bundle = layout.cable_bundles.find(
            (item) => item.portable_id === cable.bundle_portable_id,
        );
        const entry = layout.cable_entries.find(
            (item) =>
                item.portable_id ===
                (bundle?.cable_entry_portable_id ??
                    cable.cable_entry_portable_id),
        );

        return {
            selection: { type: 'external_cable', id: cable.portable_id },
            label: cable.label || 'Field cable',
            endpoints: {
                source:
                    bundle?.external_location ||
                    bundle?.name ||
                    entry?.label ||
                    'Field wiring',
                target:
                    cable.internal_component_portable_id &&
                    cable.internal_terminal
                        ? terminalEndpointLabel(
                              layout,
                              cable.internal_component_portable_id,
                              cable.internal_terminal,
                          )
                        : 'Unassigned terminal',
            },
            type: cable.cable_type || 'Unspecified cable type',
            gauge: cable.gauge,
            cableClass: bundle?.cable_class ?? cable.cable_class,
            inheritedCableClass: bundle !== undefined,
        };
    }

    if (selection.type === 'cable_bundle') {
        const bundle = layout.cable_bundles.find(
            (item) => item.portable_id === selection.id,
        );

        if (!bundle) {
            return null;
        }

        const entry = layout.cable_entries.find(
            (item) => item.portable_id === bundle.cable_entry_portable_id,
        );
        const memberCount = layout.external_cables.filter(
            (item) => item.bundle_portable_id === bundle.portable_id,
        ).length;

        return {
            selection: { type: 'cable_bundle', id: bundle.portable_id },
            label: bundle.name || 'Cable bundle',
            endpoints: {
                source:
                    bundle.external_location || entry?.label || 'Cable entry',
                target: `${memberCount} field ${memberCount === 1 ? 'cable' : 'cables'} · bundle breakout`,
            },
            type: 'Shared trunk',
            gauge: null,
            cableClass: bundle.cable_class,
            inheritedCableClass: false,
        };
    }

    return null;
}

export function getTerminalConnections(
    layout: LightingLayout,
    componentId: string,
    terminalKey: string,
): RouteDescription[] {
    const selections: LightingRouteSelection[] = [
        ...layout.connections
            .filter(
                (connection) =>
                    (connection.source_portable_id === componentId &&
                        connection.source_terminal === terminalKey) ||
                    (connection.target_portable_id === componentId &&
                        connection.target_terminal === terminalKey),
            )
            .map((connection) => ({
                type: 'connection' as const,
                id: connection.portable_id,
            })),
        ...layout.external_cables
            .filter(
                (cable) =>
                    cable.internal_component_portable_id === componentId &&
                    cable.internal_terminal === terminalKey,
            )
            .map((cable) => ({
                type: 'external_cable' as const,
                id: cable.portable_id,
            })),
    ];

    return selections.flatMap((selection) => {
        const route = describeLightingRoute(layout, selection);

        return route ? [route] : [];
    });
}

export function terminalConnectionSummary(connections: RouteDescription[]): {
    status: 'unconnected' | 'internal' | 'field' | 'multiple';
    label: string;
    selection: LightingRouteSelection | null;
} {
    if (connections.length === 0) {
        return {
            status: 'unconnected',
            label: 'Not connected',
            selection: null,
        };
    }

    if (connections.length > 1) {
        return {
            status: 'multiple',
            label: `${connections.length} connections`,
            selection: null,
        };
    }

    const connection = connections[0];

    return {
        status:
            connection.selection.type === 'connection' ? 'internal' : 'field',
        label: connection.label,
        selection: connection.selection,
    };
}
