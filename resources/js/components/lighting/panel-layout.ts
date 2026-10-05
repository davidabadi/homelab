import { rerouteConnections } from './geometry.ts';
import type {
    ComponentDefinition,
    DesignRail,
    LightingLayout,
    LightingSelection,
    PlacedComponent,
} from './types';

function ordered<T extends { sort_order?: number }>(items: T[]): T[] {
    return items
        .map((item, index) => ({ item, index }))
        .sort(
            (left, right) =>
                (left.item.sort_order ?? left.index) -
                    (right.item.sort_order ?? right.index) ||
                left.index - right.index,
        )
        .map(({ item }) => item);
}

export function panelRowItems(
    layout: LightingLayout,
    rowId: string,
): PlacedComponent[] {
    return ordered(
        layout.components.filter((item) => item.rail_portable_id === rowId),
    );
}

export function panelRowWidth(layout: LightingLayout, rowId: string): number {
    const definitions = new Map(
        layout.definitions.map((definition) => [definition.id, definition]),
    );

    return panelRowItems(layout, rowId).reduce(
        (width, item) =>
            width +
            (definitions.get(item.component_definition_id)?.width_mm ?? 0),
        0,
    );
}

export function normalizePanelLayout(layout: LightingLayout): LightingLayout {
    const definitions = new Map(
        layout.definitions.map((definition) => [definition.id, definition]),
    );
    const rows = ordered(layout.rails);
    const rowIds = new Set(rows.map((row) => row.portable_id));
    const usableWidth =
        layout.design.width_mm -
        layout.design.margin_left_mm -
        layout.design.margin_right_mm;

    if (usableWidth <= 0) {
        throw new Error('Panel width must leave room inside the enclosure.');
    }

    let above = 50;
    let below = 50;

    for (const component of layout.components) {
        if (!component.rail_portable_id) {
            continue;
        }

        if (!rowIds.has(component.rail_portable_id)) {
            throw new Error(
                'Move the devices to another row before removing this row.',
            );
        }

        const definition = definitions.get(component.component_definition_id);

        if (!definition || definition.mounting_type !== 'din-rail') {
            throw new Error('Only DIN-mounted devices can be placed in a row.');
        }

        const anchorY =
            definition.mounting_anchor_y_mm ?? definition.height_mm / 2;
        above = Math.max(above, anchorY);
        below = Math.max(below, definition.height_mm - anchorY);
    }

    const centerOffset = Math.max(70, above + 20);
    const pitch = Math.max(140, centerOffset + below + 20);
    const components = new Map<string, PlacedComponent>();
    const rails = rows.map((row, rowIndex): DesignRail => {
        const centerY =
            layout.design.margin_top_mm + rowIndex * pitch + centerOffset;
        let offsetX = layout.design.margin_left_mm;
        const items = panelRowItems(layout, row.portable_id);

        items.forEach((item, index) => {
            const definition = definitions.get(item.component_definition_id)!;
            components.set(item.portable_id, {
                ...item,
                sort_order: index,
                rotation: 0,
                x_mm: Math.round(offsetX * 100) / 100,
                y_mm:
                    Math.round(
                        (centerY -
                            (definition.mounting_anchor_y_mm ??
                                definition.height_mm / 2)) *
                            100,
                    ) / 100,
            });
            offsetX += definition.width_mm;
        });

        if (offsetX - layout.design.margin_left_mm > usableWidth + 0.01) {
            throw new Error(
                `Row ${String(rowIndex + 1).padStart(2, '0')} is full. Add another row or move a device to make room.`,
            );
        }

        return {
            ...row,
            sort_order: rowIndex,
            x_mm: layout.design.margin_left_mm,
            y_mm: Math.round((centerY - 17.5) * 100) / 100,
            length_mm: Math.round(usableWidth * 100) / 100,
            width_mm: 35,
        };
    });
    ordered(layout.components.filter((item) => !item.rail_portable_id)).forEach(
        (item, index) => {
            components.set(item.portable_id, { ...item, sort_order: index });
        },
    );

    return rerouteConnections({
        ...layout,
        design: {
            ...layout.design,
            height_mm:
                Math.round(
                    (layout.design.margin_top_mm +
                        Math.max(1, rows.length) * pitch +
                        layout.design.margin_bottom_mm) *
                        100,
                ) / 100,
        },
        rails,
        components: layout.components.map(
            (item) => components.get(item.portable_id) ?? item,
        ),
    });
}

export function insertPanelRow(
    layout: LightingLayout,
    referenceId?: string,
    position: 'above' | 'below' = 'below',
): LightingLayout {
    const rows = ordered(layout.rails);
    const reference = rows.findIndex((row) => row.portable_id === referenceId);
    const index =
        reference === -1
            ? rows.length
            : reference + (position === 'below' ? 1 : 0);
    rows.splice(index, 0, {
        portable_id: crypto.randomUUID(),
        component_definition_id: null,
        x_mm: 0,
        y_mm: 0,
        length_mm: 324,
        width_mm: 35,
    });

    return normalizePanelLayout({
        ...layout,
        rails: rows.map((row, sort_order) => ({ ...row, sort_order })),
    });
}

export function removePanelRow(
    layout: LightingLayout,
    rowId: string,
): LightingLayout {
    if (panelRowItems(layout, rowId).length > 0) {
        throw new Error(
            'Only empty rows can be removed. Move or remove the devices first.',
        );
    }

    return normalizePanelLayout({
        ...layout,
        rails: ordered(layout.rails)
            .filter((row) => row.portable_id !== rowId)
            .map((row, sort_order) => ({ ...row, sort_order })),
    });
}

export function movePanelRow(
    layout: LightingLayout,
    rowId: string,
    direction: -1 | 1,
): LightingLayout {
    const rows = ordered(layout.rails);
    const index = rows.findIndex((row) => row.portable_id === rowId);
    const destination = index + direction;

    if (index === -1 || destination < 0 || destination >= rows.length) {
        return layout;
    }

    [rows[index], rows[destination]] = [rows[destination], rows[index]];

    return normalizePanelLayout({
        ...layout,
        rails: rows.map((row, sort_order) => ({ ...row, sort_order })),
    });
}

export function placePanelDevice(
    layout: LightingLayout,
    definition: ComponentDefinition,
    rowId: string,
    index?: number,
): { layout: LightingLayout; selection: LightingSelection } {
    if (
        definition.kind !== 'component' ||
        definition.mounting_type !== 'din-rail'
    ) {
        throw new Error('Choose a DIN-mounted device for this row.');
    }

    if (!layout.rails.some((row) => row.portable_id === rowId)) {
        throw new Error('Add a row before placing a device.');
    }

    const portable_id = crypto.randomUUID();
    const component: PlacedComponent = {
        portable_id,
        component_definition_id: definition.id,
        rail_portable_id: rowId,
        x_mm: 0,
        y_mm: 0,
        rotation: 0,
        custom_label: null,
        notes: null,
        metadata: {},
    };
    const next = {
        ...layout,
        definitions: layout.definitions.some(
            (item) => item.id === definition.id,
        )
            ? layout.definitions
            : [...layout.definitions, definition],
        components: [...layout.components, component],
    };

    return {
        layout: movePanelDevice(next, portable_id, rowId, index),
        selection: { type: 'component', id: portable_id },
    };
}

export function movePanelDevice(
    layout: LightingLayout,
    componentId: string,
    rowId: string,
    index?: number,
): LightingLayout {
    if (!layout.rails.some((row) => row.portable_id === rowId)) {
        throw new Error('Choose a row in this design.');
    }

    const component = layout.components.find(
        (item) => item.portable_id === componentId,
    );
    const definition = layout.definitions.find(
        (item) => item.id === component?.component_definition_id,
    );

    if (!component || !definition || definition.mounting_type !== 'din-rail') {
        throw new Error('Only DIN-mounted devices can be moved to a row.');
    }

    const destination = panelRowItems(layout, rowId).filter(
        (item) => item.portable_id !== componentId,
    );
    destination.splice(
        Math.max(0, Math.min(index ?? destination.length, destination.length)),
        0,
        { ...component, rail_portable_id: rowId },
    );
    const updated = new Map(
        destination.map((item, sort_order) => [
            item.portable_id,
            { ...item, sort_order },
        ]),
    );
    const next = {
        ...layout,
        components: layout.components.map(
            (item) => updated.get(item.portable_id) ?? item,
        ),
    };

    if (component.rail_portable_id && component.rail_portable_id !== rowId) {
        panelRowItems(next, component.rail_portable_id).forEach(
            (item, sort_order) => {
                updated.set(item.portable_id, { ...item, sort_order });
            },
        );
        next.components = next.components.map(
            (item) => updated.get(item.portable_id) ?? item,
        );
    }

    return normalizePanelLayout(next);
}

export function reorderPanelDevice(
    layout: LightingLayout,
    componentId: string,
    direction: -1 | 1,
): LightingLayout {
    const component = layout.components.find(
        (item) => item.portable_id === componentId,
    );

    if (!component?.rail_portable_id) {
        return layout;
    }

    const items = panelRowItems(layout, component.rail_portable_id);
    const index = items.findIndex((item) => item.portable_id === componentId);
    const destination = index + direction;

    if (destination < 0 || destination >= items.length) {
        return layout;
    }

    return movePanelDevice(
        layout,
        componentId,
        component.rail_portable_id,
        destination,
    );
}
