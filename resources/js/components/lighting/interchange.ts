import type { ComponentDefinition } from './types';

export const lightingImportMaxBytes = 10 * 1024 * 1024;

export type CatalogReference = {
    catalog_family_id: string;
    revision: number;
};

export type CatalogSnapshot = Omit<
    ComponentDefinition,
    'id' | 'image_path' | 'local_image_url' | 'archived_at'
> & { has_local_image: boolean };

export type LightingInterchangeDocument = {
    format: 'homelab-lighting-design';
    schema_version: 1;
    exported_at: string;
    design: Record<string, unknown> & { name: string };
    catalog: Record<string, unknown>[];
    rows: Record<string, unknown>[];
    components: Record<string, unknown>[];
    ducts: Record<string, unknown>[];
    connections: Record<string, unknown>[];
    cable_entries: Record<string, unknown>[];
    cable_bundles: Record<string, unknown>[];
    external_cables: Record<string, unknown>[];
};

export type CatalogResolution = {
    catalog_ref: CatalogReference;
    component_definition_id: number;
};

export type ImportCatalogEntry = {
    catalog_ref: CatalogReference;
    status: 'exact' | 'missing' | 'conflict' | 'resolved';
    snapshot: CatalogSnapshot;
    definition: ComponentDefinition | null;
    message: string | null;
};

export type ImportPreflight = {
    entries: ImportCatalogEntry[];
    catalog: ComponentDefinition[];
    ready: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseLightingInterchange(
    contents: string,
): LightingInterchangeDocument {
    if (
        new TextEncoder().encode(contents).byteLength > lightingImportMaxBytes
    ) {
        throw new Error('Choose a JSON design file smaller than 10 MB.');
    }

    let document: unknown;

    try {
        document = JSON.parse(contents.replace(/^\uFEFF/, ''));
    } catch {
        throw new Error('This file does not contain valid JSON.');
    }

    if (!isObject(document)) {
        throw new Error('A lighting design must be a JSON object.');
    }

    if (document.format !== 'homelab-lighting-design') {
        throw new Error('This file is not a Homelab lighting design export.');
    }

    if (document.schema_version !== 1) {
        throw new Error(
            'This lighting design schema version is not supported.',
        );
    }

    if (
        typeof document.exported_at !== 'string' ||
        Number.isNaN(Date.parse(document.exported_at))
    ) {
        throw new Error('The export is missing a valid exported_at date.');
    }

    if (
        !isObject(document.design) ||
        typeof document.design.name !== 'string' ||
        !document.design.name.trim()
    ) {
        throw new Error('The export must include a design with a name.');
    }

    for (const field of [
        'catalog',
        'rows',
        'components',
        'ducts',
        'connections',
        'cable_entries',
        'cable_bundles',
        'external_cables',
    ]) {
        const items = document[field];

        if (!Array.isArray(items) || !items.every(isObject)) {
            throw new Error(`The export must include a valid ${field} array.`);
        }
    }

    const ids = new Set<string>();
    const groups = [
        'rows',
        'components',
        'ducts',
        'connections',
        'cable_entries',
        'cable_bundles',
        'external_cables',
    ];

    for (const group of groups) {
        for (const item of document[group] as Record<string, unknown>[]) {
            if (
                typeof item.portable_id !== 'string' ||
                !item.portable_id ||
                ids.has(item.portable_id)
            ) {
                throw new Error(
                    `The ${group} array contains missing or duplicate portable IDs.`,
                );
            }

            ids.add(item.portable_id);
        }
    }

    const entries = new Set(
        (document.cable_entries as Record<string, unknown>[]).map(
            (item) => item.portable_id,
        ),
    );
    const bundles = new Set(
        (document.cable_bundles as Record<string, unknown>[]).map(
            (item) => item.portable_id,
        ),
    );
    const components = new Set(
        (document.components as Record<string, unknown>[]).map(
            (item) => item.portable_id,
        ),
    );

    for (const bundle of document.cable_bundles as Record<string, unknown>[]) {
        if (!entries.has(bundle.cable_entry_portable_id)) {
            throw new Error(
                'A cable bundle references an entry outside this document.',
            );
        }

        validateRoutePoints(bundle.route_points, 'bundle trunk');
    }

    for (const cable of document.external_cables as Record<string, unknown>[]) {
        const bundled = Boolean(cable.bundle_portable_id);

        if (
            bundled === Boolean(cable.cable_entry_portable_id) ||
            (bundled
                ? !bundles.has(cable.bundle_portable_id)
                : !entries.has(cable.cable_entry_portable_id))
        ) {
            throw new Error(
                'An external cable must reference either a bundle or a direct entry in this document.',
            );
        }

        if (
            Boolean(cable.internal_component_portable_id) !==
                Boolean(cable.internal_terminal) ||
            (cable.internal_component_portable_id &&
                !components.has(cable.internal_component_portable_id))
        ) {
            throw new Error(
                'An external cable has an invalid internal termination.',
            );
        }

        validateRoutePoints(cable.branch_route_points, 'cable branch');
    }

    return document as LightingInterchangeDocument;
}

function validateRoutePoints(points: unknown, label: string): void {
    if (
        !Array.isArray(points) ||
        !points.every(
            (point) =>
                isObject(point) &&
                typeof point.x_mm === 'number' &&
                Number.isFinite(point.x_mm) &&
                typeof point.y_mm === 'number' &&
                Number.isFinite(point.y_mm),
        )
    ) {
        throw new Error(
            `The ${label} route must contain valid millimeter points.`,
        );
    }
}

export function catalogReferenceKey(reference: CatalogReference): string {
    return `${reference.catalog_family_id}:${reference.revision}`;
}

export function importedDesignName(name: string): string {
    return `${name.trim().slice(0, 244)} (imported)`;
}
