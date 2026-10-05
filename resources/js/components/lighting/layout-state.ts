import { refreshExternalCabling } from './external-cabling.ts';
import {
    reconcileRailAttachments,
    rerouteConnections,
    snapComponentToRail,
    snapPoint,
} from './geometry.ts';
import type {
    ComponentDefinition,
    LightingLayout,
    LightingSelection,
    MmPoint,
    PlacedComponent,
} from './types';

export type LightingSnapshot = Omit<
    LightingLayout,
    'definitions' | 'design'
> & {
    structured: boolean;
    design: Omit<
        LightingLayout['design'],
        'id' | 'save_version' | 'updated_at'
    >;
};

export function layoutSnapshot(layout: LightingLayout): LightingSnapshot {
    const design = {
        name: layout.design.name,
        width_mm: layout.design.width_mm,
        height_mm: layout.design.height_mm,
        depth_mm: layout.design.depth_mm,
        margin_top_mm: layout.design.margin_top_mm,
        margin_right_mm: layout.design.margin_right_mm,
        margin_bottom_mm: layout.design.margin_bottom_mm,
        margin_left_mm: layout.design.margin_left_mm,
        grid_size_mm: layout.design.grid_size_mm,
        snap_to_grid: layout.design.snap_to_grid,
        notes: layout.design.notes,
        metadata: layout.design.metadata ?? {},
    };

    return {
        structured: true,
        design,
        components: layout.components,
        rails: layout.rails,
        ducts: layout.ducts,
        connections: layout.connections,
        cable_entries: layout.cable_entries,
        cable_bundles: layout.cable_bundles,
        external_cables: layout.external_cables,
    };
}

export function placeDefinition(
    layout: LightingLayout,
    definition: ComponentDefinition,
    point: MmPoint,
): { layout: LightingLayout; selection: LightingSelection } {
    const position = layout.design.snap_to_grid
        ? snapPoint(point, layout.design.grid_size_mm)
        : point;
    const portable_id = crypto.randomUUID();

    if (definition.kind === 'rail') {
        return {
            layout: {
                ...layout,
                rails: [
                    ...layout.rails,
                    {
                        portable_id,
                        component_definition_id: definition.id,
                        ...position,
                        length_mm: definition.width_mm,
                        width_mm: definition.height_mm,
                    },
                ],
            },
            selection: { type: 'rail', id: portable_id },
        };
    }

    if (definition.kind === 'duct') {
        return {
            layout: {
                ...layout,
                ducts: [
                    ...layout.ducts,
                    {
                        portable_id,
                        component_definition_id: definition.id,
                        ...position,
                        width_mm: Math.min(
                            definition.width_mm,
                            definition.height_mm,
                        ),
                        length_mm: Math.max(
                            definition.width_mm,
                            definition.height_mm,
                        ),
                        orientation:
                            definition.width_mm >= definition.height_mm
                                ? 'horizontal'
                                : 'vertical',
                    },
                ],
            },
            selection: { type: 'duct', id: portable_id },
        };
    }

    const component = snapComponentToRail(
        {
            portable_id,
            component_definition_id: definition.id,
            ...position,
            rotation: 0,
            custom_label: null,
            rail_portable_id: null,
            notes: null,
            metadata: {},
        },
        definition,
        layout,
    );

    return {
        layout: { ...layout, components: [...layout.components, component] },
        selection: { type: 'component', id: portable_id },
    };
}

export function deleteLayoutObjects(
    layout: LightingLayout,
    selections: NonNullable<LightingSelection>[],
): LightingLayout {
    const deletedComponents = new Set(
        selections
            .filter((item) => item.type === 'component')
            .map((item) => item.id),
    );
    const deletedRails = new Set(
        selections
            .filter((item) => item.type === 'rail')
            .map((item) => item.id),
    );
    const deletedDucts = new Set(
        selections
            .filter((item) => item.type === 'duct')
            .map((item) => item.id),
    );
    const deletedWires = new Set(
        selections
            .filter((item) => item.type === 'connection')
            .map((item) => item.id),
    );
    const deletedBundles = new Set(
        selections
            .filter((item) => item.type === 'cable_bundle')
            .map((item) => item.id),
    );
    const deletedCables = new Set(
        selections
            .filter((item) => item.type === 'external_cable')
            .map((item) => item.id),
    );
    const deletedEntries = new Set(
        selections
            .filter((item) => item.type === 'cable_entry')
            .map((item) => item.id),
    );

    if (
        layout.cable_bundles.some(
            (item) =>
                deletedEntries.has(item.cable_entry_portable_id) &&
                !deletedBundles.has(item.portable_id),
        ) ||
        layout.external_cables.some(
            (item) =>
                deletedEntries.has(item.cable_entry_portable_id ?? '') &&
                !deletedCables.has(item.portable_id),
        )
    ) {
        throw new Error(
            'Reassign or remove the bundles and direct cables before deleting this entry.',
        );
    }

    return refreshExternalCabling({
        ...layout,
        components: layout.components
            .filter(
                (component) => !deletedComponents.has(component.portable_id),
            )
            .map((component) =>
                deletedRails.has(component.rail_portable_id ?? '')
                    ? { ...component, rail_portable_id: null }
                    : component,
            ),
        rails: layout.rails.filter(
            (rail) => !deletedRails.has(rail.portable_id),
        ),
        ducts: layout.ducts.filter(
            (duct) => !deletedDucts.has(duct.portable_id),
        ),
        connections: layout.connections.filter(
            (connection) =>
                !deletedWires.has(connection.portable_id) &&
                !deletedComponents.has(connection.source_portable_id) &&
                !deletedComponents.has(connection.target_portable_id),
        ),
        cable_entries: layout.cable_entries.filter(
            (item) => !deletedEntries.has(item.portable_id),
        ),
        cable_bundles: layout.cable_bundles.filter(
            (item) => !deletedBundles.has(item.portable_id),
        ),
        external_cables: layout.external_cables.filter(
            (item) =>
                !deletedCables.has(item.portable_id) &&
                !deletedBundles.has(item.bundle_portable_id ?? ''),
        ),
    });
}

export function duplicateLayoutObject(
    layout: LightingLayout,
    selection: NonNullable<LightingSelection>,
): { layout: LightingLayout; selection: LightingSelection } {
    const offset = layout.design.grid_size_mm * 2;
    const portable_id = crypto.randomUUID();

    switch (selection.type) {
        case 'component': {
            const original = layout.components.find(
                (component) => component.portable_id === selection.id,
            );

            if (!original) {
                return { layout, selection };
            }

            const definition = layout.definitions.find(
                (item) => item.id === original.component_definition_id,
            );
            let copy: PlacedComponent = {
                ...original,
                portable_id,
                x_mm: original.x_mm + offset,
                y_mm: original.y_mm + offset,
                rail_portable_id: null,
                custom_label: original.custom_label
                    ? `${original.custom_label} (copy)`
                    : null,
            };

            if (definition) {
                copy = snapComponentToRail(copy, definition, layout);
            }

            return {
                layout: { ...layout, components: [...layout.components, copy] },
                selection: { type: 'component', id: portable_id },
            };
        }
        case 'rail': {
            const original = layout.rails.find(
                (rail) => rail.portable_id === selection.id,
            );

            return original
                ? {
                      layout: {
                          ...layout,
                          rails: [
                              ...layout.rails,
                              {
                                  ...original,
                                  portable_id,
                                  x_mm: original.x_mm + offset,
                                  y_mm: original.y_mm + offset,
                              },
                          ],
                      },
                      selection: { type: 'rail', id: portable_id },
                  }
                : { layout, selection };
        }
        case 'duct': {
            const original = layout.ducts.find(
                (duct) => duct.portable_id === selection.id,
            );

            return original
                ? {
                      layout: {
                          ...layout,
                          ducts: [
                              ...layout.ducts,
                              {
                                  ...original,
                                  portable_id,
                                  x_mm: original.x_mm + offset,
                                  y_mm: original.y_mm + offset,
                              },
                          ],
                      },
                      selection: { type: 'duct', id: portable_id },
                  }
                : { layout, selection };
        }
        case 'connection':
        case 'cable_entry':
        case 'cable_bundle':
        case 'external_cable':
            return { layout, selection };
    }
}

export function reconcileDefinitionPositions(
    layout: LightingLayout,
): LightingLayout {
    return refreshExternalCabling(
        rerouteConnections(reconcileRailAttachments(layout)),
    );
}
