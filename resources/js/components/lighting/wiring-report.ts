import { getTerminalConnections } from './connection-lookup.ts';
import { cableEntryPoint, externalCableLengthMm } from './external-cabling.ts';
import { cableLengthMm, componentBounds } from './geometry.ts';
import type {
    CatalogReference,
    CatalogSnapshot,
    LightingInterchangeDocument,
} from './interchange';
import { catalogReferenceKey } from './interchange.ts';
import type {
    CableBundle,
    CableClass,
    CableDirection,
    CableEntry,
    ComponentDefinition,
    DesignConnection,
    DesignDuct,
    DesignRail,
    ExternalCable,
    LightingDesign,
    LightingLayout,
    MmPoint,
    PlacedComponent,
} from './types';

export type ReportEndpoint = {
    reference: string;
    label: string;
    terminal: string;
};

export type ReportTerminal = {
    key: string;
    label: string;
    purpose: string | null;
    routes: {
        reference: string;
        connectedTo: string;
        notes: string | null;
    }[];
};

export type ReportDevice = {
    reference: string;
    component: PlacedComponent;
    definition: ComponentDefinition;
    rowReference: string | null;
    terminals: ReportTerminal[];
};

export type ReportWire = {
    reference: string;
    connection: DesignConnection;
    from: ReportEndpoint;
    to: ReportEndpoint;
    panelLengthMm: number;
};

export type ReportEntry = {
    reference: string;
    entry: CableEntry;
    point: MmPoint;
};

export type ReportBundle = {
    reference: string;
    bundle: CableBundle;
    entryReference: string;
    definedCount: number;
    unassignedCount: number;
    missingPlannedCount: number;
};

export type ReportExternalCable = {
    reference: string;
    cable: ExternalCable;
    entryReference: string;
    bundleReference: string | null;
    cableClass: CableClass;
    direction: CableDirection;
    externalLocation: string | null;
    termination: ReportEndpoint | null;
    panelLengthMm: number | null;
};

export type ReportMaterial = {
    scope: 'Internal wire' | 'Field cable';
    cableType: string;
    gauge: string | null;
    conductorCount: number;
    cableClass: CableClass | null;
    runs: number;
    routedRuns: number;
    panelLengthMm: number;
};

export type ReportDiagramRoute = {
    reference: string;
    kind: 'connection' | 'cable_bundle' | 'external_cable';
    points: MmPoint[];
    cableClass: CableClass | null;
};

export type WiringReport = {
    name: string;
    generatedAt: string;
    filename: string;
    layout: LightingLayout;
    rows: { reference: string; rail: DesignRail }[];
    devices: ReportDevice[];
    wires: ReportWire[];
    entries: ReportEntry[];
    bundles: ReportBundle[];
    externalCables: ReportExternalCable[];
    materials: ReportMaterial[];
    equipment: { definition: ComponentDefinition; quantity: number }[];
    diagramRoutes: ReportDiagramRoute[];
    incomplete: {
        unassignedCables: number;
        spareTerminals: number;
        plannedCablesMissing: number;
    };
};

type CatalogPlaced<T> = Omit<T, 'component_definition_id'> & {
    catalog_ref: CatalogReference | null;
};

/** The export endpoint validates this boundary before report preparation. */
function reportLayout(document: LightingInterchangeDocument): LightingLayout {
    const catalog = [...(document.catalog as CatalogSnapshot[])].sort((a, b) =>
        compare(catalogReferenceKey(a), catalogReferenceKey(b)),
    );
    const definitions = catalog.map((snapshot, index) => ({
        ...snapshot,
        id: index + 1,
        image_path: null,
        local_image_url: null,
        archived_at: null,
    }));
    const definitionIds = new Map(
        definitions.map((definition) => [
            catalogReferenceKey(definition),
            definition.id,
        ]),
    );
    const definitionId = (
        reference: CatalogReference | null,
    ): number | null => {
        if (!reference) {
            return null;
        }

        const id = definitionIds.get(catalogReferenceKey(reference));

        if (!id) {
            throw new Error(
                'The wiring report is missing a catalog definition.',
            );
        }

        return id;
    };
    const components = (
        document.components as CatalogPlaced<PlacedComponent>[]
    ).map(({ catalog_ref, ...component }) => {
        const component_definition_id = definitionId(catalog_ref);

        if (component_definition_id === null) {
            throw new Error(
                'A report device is missing its catalog reference.',
            );
        }

        return { ...component, component_definition_id };
    });

    return {
        design: {
            ...(document.design as Omit<
                LightingDesign,
                'id' | 'save_version' | 'updated_at'
            >),
            id: 0,
            save_version: 0,
            updated_at: document.exported_at,
        },
        definitions,
        components,
        rails: (document.rows as CatalogPlaced<DesignRail>[]).map(
            ({ catalog_ref, ...rail }) => ({
                ...rail,
                component_definition_id: definitionId(catalog_ref),
            }),
        ),
        ducts: (document.ducts as CatalogPlaced<DesignDuct>[]).map(
            ({ catalog_ref, ...duct }) => ({
                ...duct,
                component_definition_id: definitionId(catalog_ref),
            }),
        ),
        connections: document.connections as DesignConnection[],
        cable_entries: document.cable_entries as CableEntry[],
        cable_bundles: document.cable_bundles as CableBundle[],
        external_cables: document.external_cables as ExternalCable[],
    };
}

function compare(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function reference(prefix: string, index: number, digits = 2): string {
    return `${prefix}-${String(index + 1).padStart(digits, '0')}`;
}

function materialSummary(
    wires: ReportWire[],
    externalCables: ReportExternalCable[],
): ReportMaterial[] {
    const groups = new Map<string, ReportMaterial>();
    const runs = [
        ...wires.map((wire) => ({
            scope: 'Internal wire' as const,
            cableType: wire.connection.cable_type,
            gauge: wire.connection.gauge,
            conductorCount: wire.connection.conductor_count,
            cableClass: null,
            length: wire.panelLengthMm,
        })),
        ...externalCables.map((cable) => ({
            scope: 'Field cable' as const,
            cableType: cable.cable.cable_type,
            gauge: cable.cable.gauge,
            conductorCount: cable.cable.conductor_count,
            cableClass: cable.cableClass,
            length: cable.panelLengthMm,
        })),
    ];

    for (const run of runs) {
        const key = JSON.stringify([
            run.scope,
            run.cableType,
            run.gauge,
            run.conductorCount,
            run.cableClass,
        ]);
        const group = groups.get(key) ?? {
            scope: run.scope,
            cableType: run.cableType,
            gauge: run.gauge,
            conductorCount: run.conductorCount,
            cableClass: run.cableClass,
            runs: 0,
            routedRuns: 0,
            panelLengthMm: 0,
        };
        group.runs += 1;

        if (run.length !== null) {
            group.routedRuns += 1;
            group.panelLengthMm += run.length;
        }

        groups.set(key, group);
    }

    return [...groups.entries()]
        .sort(([a], [b]) => compare(a, b))
        .map(([, group]) => group);
}

/** Prepares one immutable set of references for every diagram and schedule. */
export function buildWiringReport(
    validatedDocument: LightingInterchangeDocument,
): WiringReport {
    const document = structuredClone(validatedDocument);
    const layout = reportLayout(document);
    const definitions = new Map(
        layout.definitions.map((item) => [item.id, item]),
    );
    const rows = [...layout.rails]
        .sort(
            (a, b) =>
                (a.sort_order ?? a.y_mm) - (b.sort_order ?? b.y_mm) ||
                a.y_mm - b.y_mm ||
                compare(a.portable_id, b.portable_id),
        )
        .map((rail, index) => ({ reference: reference('ROW', index), rail }));
    const rowById = new Map(rows.map((row) => [row.rail.portable_id, row]));
    const rowOrder = new Map(
        rows.map((row, index) => [row.rail.portable_id, index]),
    );
    const devices: ReportDevice[] = [...layout.components]
        .sort(
            (a, b) =>
                (rowOrder.get(a.rail_portable_id ?? '') ?? rows.length) -
                    (rowOrder.get(b.rail_portable_id ?? '') ?? rows.length) ||
                a.y_mm - b.y_mm ||
                a.x_mm - b.x_mm ||
                compare(a.portable_id, b.portable_id),
        )
        .map((component, index) => {
            const definition = definitions.get(
                component.component_definition_id,
            );

            if (!definition) {
                throw new Error('A report device is missing its definition.');
            }

            return {
                reference: reference('DEV', index),
                component,
                definition,
                rowReference:
                    rowById.get(component.rail_portable_id ?? '')?.reference ??
                    null,
                terminals: [],
            };
        });
    const deviceById = new Map(
        devices.map((device) => [device.component.portable_id, device]),
    );
    const endpoint = (id: string, terminal: string): ReportEndpoint => {
        const device = deviceById.get(id);

        if (!device) {
            throw new Error('A wiring report endpoint is missing its device.');
        }

        return {
            reference: device.reference,
            label:
                device.component.custom_label || device.definition.display_name,
            terminal,
        };
    };
    const wires = [...layout.connections]
        .sort((a, b) =>
            compare(
                `${endpoint(a.source_portable_id, a.source_terminal).reference}|${a.source_terminal}|${endpoint(a.target_portable_id, a.target_terminal).reference}|${a.target_terminal}|${a.portable_id}`,
                `${endpoint(b.source_portable_id, b.source_terminal).reference}|${b.source_terminal}|${endpoint(b.target_portable_id, b.target_terminal).reference}|${b.target_terminal}|${b.portable_id}`,
            ),
        )
        .map((connection, index) => ({
            reference: reference('W', index, 3),
            connection,
            from: endpoint(
                connection.source_portable_id,
                connection.source_terminal,
            ),
            to: endpoint(
                connection.target_portable_id,
                connection.target_terminal,
            ),
            panelLengthMm: cableLengthMm(connection.route_points),
        }));
    const sideOrder = { top: 0, right: 1, bottom: 2, left: 3 };
    const entries = [...layout.cable_entries]
        .sort(
            (a, b) =>
                sideOrder[a.side] - sideOrder[b.side] ||
                a.offset_mm - b.offset_mm ||
                compare(a.portable_id, b.portable_id),
        )
        .map((entry, index) => ({
            reference: reference('ENT', index),
            entry,
            point: cableEntryPoint(entry, layout.design),
        }));
    const entryById = new Map(
        entries.map((entry) => [entry.entry.portable_id, entry]),
    );
    const bundles = [...layout.cable_bundles]
        .sort((a, b) =>
            compare(
                `${entryById.get(a.cable_entry_portable_id)?.reference}|${a.name}|${a.portable_id}`,
                `${entryById.get(b.cable_entry_portable_id)?.reference}|${b.name}|${b.portable_id}`,
            ),
        )
        .map((bundle, index) => {
            const cables = layout.external_cables.filter(
                (cable) => cable.bundle_portable_id === bundle.portable_id,
            );

            return {
                reference: reference('BND', index),
                bundle,
                entryReference:
                    entryById.get(bundle.cable_entry_portable_id)?.reference ??
                    'UNASSIGNED',
                definedCount: cables.length,
                unassignedCount: cables.filter(
                    (cable) => !cable.internal_component_portable_id,
                ).length,
                missingPlannedCount: Math.max(
                    0,
                    (bundle.planned_count ?? 0) - cables.length,
                ),
            };
        });
    const bundleById = new Map(
        bundles.map((bundle) => [bundle.bundle.portable_id, bundle]),
    );
    const externalCables = [...layout.external_cables]
        .sort((a, b) =>
            compare(
                `${bundleById.get(a.bundle_portable_id ?? '')?.reference ?? entryById.get(a.cable_entry_portable_id ?? '')?.reference}|${a.label}|${a.portable_id}`,
                `${bundleById.get(b.bundle_portable_id ?? '')?.reference ?? entryById.get(b.cable_entry_portable_id ?? '')?.reference}|${b.label}|${b.portable_id}`,
            ),
        )
        .map((cable, index): ReportExternalCable => {
            const bundle = bundleById.get(cable.bundle_portable_id ?? '');
            const termination =
                cable.internal_component_portable_id && cable.internal_terminal
                    ? endpoint(
                          cable.internal_component_portable_id,
                          cable.internal_terminal,
                      )
                    : null;

            return {
                reference: reference('EXT', index, 3),
                cable,
                entryReference:
                    bundle?.entryReference ??
                    entryById.get(cable.cable_entry_portable_id ?? '')
                        ?.reference ??
                    'UNASSIGNED',
                bundleReference: bundle?.reference ?? null,
                cableClass:
                    bundle?.bundle.cable_class ?? cable.cable_class ?? 'other',
                direction:
                    bundle?.bundle.direction ?? cable.direction ?? 'mixed',
                externalLocation: bundle?.bundle.external_location ?? null,
                termination,
                panelLengthMm: termination
                    ? externalCableLengthMm(cable, layout)
                    : null,
            };
        });
    const wireById = new Map(
        wires.map((wire) => [wire.connection.portable_id, wire]),
    );
    const externalById = new Map(
        externalCables.map((cable) => [cable.cable.portable_id, cable]),
    );

    for (const device of devices) {
        device.terminals = device.definition.terminals.map((terminal) => ({
            key: terminal.key,
            label: terminal.label,
            purpose: terminal.purpose,
            routes: getTerminalConnections(
                layout,
                device.component.portable_id,
                terminal.key,
            )
                .map((route) => {
                    if (route.selection.type === 'connection') {
                        const wire = wireById.get(route.selection.id)!;
                        const other =
                            wire.connection.source_portable_id ===
                                device.component.portable_id &&
                            wire.connection.source_terminal === terminal.key
                                ? wire.to
                                : wire.from;

                        return {
                            reference: wire.reference,
                            connectedTo: `${other.reference} ${other.terminal} - ${other.label}`,
                            notes: wire.connection.notes,
                        };
                    }

                    const cable = externalById.get(route.selection.id)!;

                    return {
                        reference: cable.reference,
                        connectedTo: [cable.cable.label, cable.externalLocation]
                            .filter(Boolean)
                            .join(' - '),
                        notes: cable.cable.notes,
                    };
                })
                .sort((left, right) =>
                    compare(left.reference, right.reference),
                ),
        }));
    }

    const name = layout.design.name;
    const slug =
        name
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 120) || 'lighting-panel';

    return {
        name,
        generatedAt: document.exported_at,
        filename: `${slug}-wiring.pdf`,
        layout,
        rows,
        devices,
        wires,
        entries,
        bundles,
        externalCables,
        materials: materialSummary(wires, externalCables),
        equipment: [...definitions.values()]
            .map((definition) => ({
                definition,
                quantity: [
                    ...layout.components,
                    ...layout.rails,
                    ...layout.ducts,
                ].filter(
                    (item) => item.component_definition_id === definition.id,
                ).length,
            }))
            .filter((item) => item.quantity > 0),
        diagramRoutes: [
            ...wires.map((wire) => ({
                reference: wire.reference,
                kind: 'connection' as const,
                points: wire.connection.route_points,
                cableClass: null,
            })),
            ...bundles.map((bundle) => ({
                reference: bundle.reference,
                kind: 'cable_bundle' as const,
                points: bundle.bundle.route_points,
                cableClass: bundle.bundle.cable_class,
            })),
            ...externalCables
                .filter((cable) => cable.cable.branch_route_points.length > 1)
                .map((cable) => ({
                    reference: cable.reference,
                    kind: 'external_cable' as const,
                    points: cable.cable.branch_route_points,
                    cableClass: cable.cableClass,
                })),
        ],
        incomplete: {
            unassignedCables: externalCables.filter(
                (cable) => !cable.termination,
            ).length,
            spareTerminals: devices.reduce(
                (count, device) =>
                    count +
                    device.terminals.filter(
                        (terminal) => terminal.routes.length === 0,
                    ).length,
                0,
            ),
            plannedCablesMissing: bundles.reduce(
                (count, bundle) => count + bundle.missingPlannedCount,
                0,
            ),
        },
    };
}

export function reportDeviceBounds(device: ReportDevice) {
    return componentBounds(device.component, device.definition);
}
