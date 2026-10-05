export type MmPoint = { x_mm: number; y_mm: number };

export type TerminalDefinition = MmPoint & {
    key: string;
    label: string;
    side: 'top' | 'right' | 'bottom' | 'left';
    purpose: string | null;
    metadata?: Record<string, unknown>;
};

export type ComponentDefinition = {
    id: number;
    catalog_family_id: string;
    revision: number;
    manufacturer: string;
    model: string;
    display_name: string;
    category: string;
    kind: 'component' | 'rail' | 'duct';
    sku: string | null;
    width_mm: number;
    height_mm: number;
    depth_mm: number | null;
    din_modules: number | null;
    mounting_type: string;
    image_path: string | null;
    image_url: string | null;
    local_image_url: string | null;
    datasheet_url: string | null;
    description: string | null;
    terminals: TerminalDefinition[];
    metadata: Record<string, unknown>;
    mounting_anchor_x_mm: number | null;
    mounting_anchor_y_mm: number | null;
    archived_at: string | null;
};

export type LightingDesign = {
    id: number;
    name: string;
    width_mm: number;
    height_mm: number;
    depth_mm: number | null;
    margin_top_mm: number;
    margin_right_mm: number;
    margin_bottom_mm: number;
    margin_left_mm: number;
    grid_size_mm: number;
    snap_to_grid: boolean;
    notes: string | null;
    metadata: Record<string, unknown>;
    save_version: number;
    updated_at: string;
};

export type PlacedComponent = MmPoint & {
    portable_id: string;
    sort_order?: number;
    component_definition_id: number;
    rotation: number;
    custom_label: string | null;
    rail_portable_id: string | null;
    notes: string | null;
    metadata: Record<string, unknown>;
};

export type DesignRail = MmPoint & {
    portable_id: string;
    sort_order?: number;
    component_definition_id: number | null;
    length_mm: number;
    width_mm: number;
};

export type DesignDuct = DesignRail & {
    orientation: 'horizontal' | 'vertical';
};

export type DesignConnection = {
    portable_id: string;
    source_portable_id: string;
    source_terminal: string;
    target_portable_id: string;
    target_terminal: string;
    cable_type: string;
    color: string | null;
    gauge: string | null;
    conductor_count: number;
    route_points: MmPoint[];
    actual_length_mm: number | null;
    notes: string | null;
};

export type LightingLayout = {
    design: LightingDesign;
    definitions: ComponentDefinition[];
    components: PlacedComponent[];
    rails: DesignRail[];
    ducts: DesignDuct[];
    connections: DesignConnection[];
};

export type LightingSelection = {
    type: 'component' | 'rail' | 'duct' | 'connection';
    id: string;
} | null;

export type LightingDesignSummary = LightingDesign & {
    components_count: number;
    connections_count: number;
};

export type PanelCanvasApi = {
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
};
