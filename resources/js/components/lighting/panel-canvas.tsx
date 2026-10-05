import { ConnectionMode, ReactFlow, SelectionMode } from '@xyflow/react';
import type {
    Connection,
    EdgeChange,
    Node,
    NodeChange,
    ReactFlowInstance,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import ComponentNode from './component-node';
import DuctNode from './duct-node';
import EnclosureNode from './enclosure-node';
import { ExternalCablingLayer } from './external-cabling-layer';
import {
    canvasPointToMm,
    componentBounds,
    createOrthogonalRoute,
    mmPointToCanvas,
    mmToCanvas,
    moveLayoutObject,
    outsideBounds,
    rerouteConnections,
    terminalPoint,
} from './geometry';
import RailNode from './rail-node';
import type {
    LightingLayout,
    LightingSelection,
    MmPoint,
    PanelCanvasApi,
} from './types';
import WireEdge from './wire-edge';
import type { PhysicalWireEdge } from './wire-edge';
import '@xyflow/react/dist/style.css';

const nodeTypes = {
    component: ComponentNode,
    rail: RailNode,
    duct: DuctNode,
    enclosure: EnclosureNode,
};
const edgeTypes = { wire: WireEdge };
type PhysicalFlowInstance = ReactFlowInstance<Node, PhysicalWireEdge>;

export type PanelCanvasProps = {
    layout: LightingLayout;
    selection: LightingSelection;
    onChange: (layout: LightingLayout, commit?: boolean) => void;
    onSelectionChange: (selection: LightingSelection) => void;
    onSelectedObjectsChange?: (
        selection: NonNullable<LightingSelection>[],
    ) => void;
    onDropDefinition: (id: number, point: MmPoint) => void;
    onInitApi?: (api: PanelCanvasApi) => void;
    onZoomChange?: (zoom: number) => void;
    showGrid: boolean;
    showWires: boolean;
    showExternalCabling?: boolean;
    showCableLabels?: boolean;
    showLabels: boolean;
    layoutReadOnly?: boolean;
};

function selectionFromId(id: string): LightingSelection {
    const [type, portableId] = id.split(':');

    return [
        'component',
        'rail',
        'duct',
        'connection',
        'cable_entry',
        'cable_bundle',
        'external_cable',
    ].includes(type)
        ? {
              type: type as NonNullable<LightingSelection>['type'],
              id: portableId,
          }
        : null;
}

export function PanelCanvas({
    layout,
    selection,
    onChange,
    onSelectionChange,
    onSelectedObjectsChange,
    onDropDefinition,
    onInitApi,
    onZoomChange,
    showGrid,
    showWires,
    showExternalCabling = true,
    showCableLabels = true,
    showLabels,
    layoutReadOnly = true,
}: PanelCanvasProps) {
    const [instance, setInstance] = useState<PhysicalFlowInstance | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const selected = useCallback(
        (type: string, id: string) => {
            if (!selection) {
                return false;
            }

            return selectedIds.includes(`${selection.type}:${selection.id}`)
                ? selectedIds.includes(`${type}:${id}`)
                : selection.type === type && selection.id === id;
        },
        [selection, selectedIds],
    );

    const selectionChanged = useCallback(
        ({
            nodes: selectedNodes,
            edges: selectedEdges,
        }: {
            nodes: Node[];
            edges: PhysicalWireEdge[];
        }) => {
            const objects = [...selectedNodes, ...selectedEdges]
                .map((object) => selectionFromId(object.id))
                .filter(
                    (object): object is NonNullable<LightingSelection> =>
                        object !== null,
                );
            onSelectedObjectsChange?.(objects);
        },
        [onSelectedObjectsChange],
    );

    const nodes = useMemo<Node[]>(() => {
        const enclosure: Node = {
            id: 'enclosure',
            type: 'enclosure',
            position: { x: 0, y: 0 },
            width: mmToCanvas(layout.design.width_mm),
            height: mmToCanvas(layout.design.height_mm),
            data: { design: layout.design, showGrid },
            draggable: false,
            selectable: false,
            connectable: false,
            focusable: false,
            zIndex: -100,
            style: { pointerEvents: 'none' },
        };
        const devices = layout.components.flatMap((component): Node[] => {
            const definition = layout.definitions.find(
                (item) => item.id === component.component_definition_id,
            );

            if (!definition) {
                return [];
            }

            const bounds = componentBounds(component, definition);

            return [
                {
                    id: `component:${component.portable_id}`,
                    type: 'component',
                    position: mmPointToCanvas(component),
                    width: mmToCanvas(bounds.width),
                    height: mmToCanvas(bounds.height),
                    selected: selected('component', component.portable_id),
                    data: {
                        component,
                        definition,
                        showLabels,
                        warning: outsideBounds(bounds, layout.design),
                    },
                    zIndex: 1,
                },
            ];
        });
        const rails = layout.rails.map((rail): Node => ({
            id: `rail:${rail.portable_id}`,
            type: 'rail',
            position: mmPointToCanvas(rail),
            width: mmToCanvas(rail.length_mm),
            height: mmToCanvas(rail.width_mm),
            selected: selected('rail', rail.portable_id),
            data: {
                rail,
                showLabels,
                warning: outsideBounds(
                    { ...rail, width: rail.length_mm, height: rail.width_mm },
                    layout.design,
                ),
            },
            zIndex: -10,
        }));
        const ducts = layout.ducts.map((duct): Node => {
            const width =
                duct.orientation === 'horizontal'
                    ? duct.length_mm
                    : duct.width_mm;
            const height =
                duct.orientation === 'horizontal'
                    ? duct.width_mm
                    : duct.length_mm;

            return {
                id: `duct:${duct.portable_id}`,
                type: 'duct',
                position: mmPointToCanvas(duct),
                width: mmToCanvas(width),
                height: mmToCanvas(height),
                selected: selected('duct', duct.portable_id),
                data: {
                    duct,
                    showLabels,
                    warning: outsideBounds(
                        { ...duct, width, height },
                        layout.design,
                    ),
                },
                zIndex: -5,
            };
        });

        return [enclosure, ...rails, ...ducts, ...devices];
    }, [layout, selected, showGrid, showLabels]);

    const edges = useMemo<PhysicalWireEdge[]>(
        () =>
            layout.connections.map((connection) => ({
                id: `connection:${connection.portable_id}`,
                type: 'wire',
                source: `component:${connection.source_portable_id}`,
                sourceHandle: connection.source_terminal,
                target: `component:${connection.target_portable_id}`,
                targetHandle: connection.target_terminal,
                hidden: !showWires,
                selected: selected('connection', connection.portable_id),
                zIndex: 5,
                data: {
                    connection,
                    gridSize: layout.design.grid_size_mm,
                    snap: layout.design.snap_to_grid,
                    showLabels: showCableLabels,
                    onRoute: (points, commit) =>
                        onChange(
                            {
                                ...layout,
                                connections: layout.connections.map(
                                    (candidate) =>
                                        candidate.portable_id ===
                                        connection.portable_id
                                            ? {
                                                  ...candidate,
                                                  route_points: points,
                                              }
                                            : candidate,
                                ),
                            },
                            commit,
                        ),
                },
            })),
        [layout, onChange, selected, showCableLabels, showWires],
    );

    const fit = useCallback(
        (flow: PhysicalFlowInstance) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    void flow.fitBounds(
                        {
                            x: -170,
                            y: -220,
                            width: mmToCanvas(layout.design.width_mm) + 260,
                            height: mmToCanvas(layout.design.height_mm) + 280,
                        },
                        { padding: 0.05, duration: 0 },
                    );
                });
            });
        },
        [layout.design.width_mm, layout.design.height_mm],
    );

    function initialize(flow: PhysicalFlowInstance) {
        setInstance(flow);
        fit(flow);
    }

    useEffect(() => {
        if (!instance) {
            return;
        }

        onInitApi?.({
            zoomIn: () => {
                void instance.zoomIn();
            },
            zoomOut: () => {
                void instance.zoomOut();
            },
            fit: () => fit(instance),
        });
    }, [instance, fit, onInitApi]);

    function changeSelected(changes: NodeChange[] | EdgeChange[]) {
        const updates = changes.filter((change) => change.type === 'select');

        if (updates.length === 0) {
            return;
        }

        const primaryId = selection
            ? `${selection.type}:${selection.id}`
            : null;
        const activeIds =
            primaryId && selectedIds.includes(primaryId)
                ? selectedIds
                : primaryId
                  ? [primaryId]
                  : [];
        const result = new Set(activeIds);

        for (const change of updates) {
            if (change.type === 'select' && change.selected) {
                result.add(change.id);
            } else {
                result.delete(change.id);
            }
        }

        const identifiers = [...result];
        setSelectedIds(identifiers);
        const primary = identifiers.at(-1);
        onSelectionChange(primary ? selectionFromId(primary) : null);
    }

    function moveNodes(dragged: Node[], commit: boolean) {
        if (layoutReadOnly) {
            return;
        }

        let next = layout;
        const movingRails = new Set(
            dragged
                .filter((node) => node.type === 'rail')
                .map((node) => selectionFromId(node.id)?.id),
        );

        for (const node of [...dragged].sort(
            (left, right) =>
                Number(right.type === 'rail') - Number(left.type === 'rail'),
        )) {
            const object = selectionFromId(node.id);
            const component =
                object?.type === 'component'
                    ? layout.components.find(
                          (candidate) => candidate.portable_id === object.id,
                      )
                    : null;

            if (
                component?.rail_portable_id &&
                movingRails.has(component.rail_portable_id)
            ) {
                continue;
            }

            next = moveLayoutObject(
                next,
                object,
                canvasPointToMm(node.position),
            );
        }

        onChange(rerouteConnections(next), commit);
    }

    function connect(connection: Connection) {
        const sourceId = selectionFromId(connection.source)?.id;
        const targetId = selectionFromId(connection.target)?.id;
        const source = layout.components.find(
            (component) => component.portable_id === sourceId,
        );
        const target = layout.components.find(
            (component) => component.portable_id === targetId,
        );
        const sourceDefinition = layout.definitions.find(
            (definition) => definition.id === source?.component_definition_id,
        );
        const targetDefinition = layout.definitions.find(
            (definition) => definition.id === target?.component_definition_id,
        );

        if (
            !source ||
            !target ||
            !sourceDefinition ||
            !targetDefinition ||
            !connection.sourceHandle ||
            !connection.targetHandle ||
            (sourceId === targetId &&
                connection.sourceHandle === connection.targetHandle)
        ) {
            return;
        }

        const wire = {
            portable_id: crypto.randomUUID(),
            source_portable_id: source.portable_id,
            source_terminal: connection.sourceHandle,
            target_portable_id: target.portable_id,
            target_terminal: connection.targetHandle,
            cable_type: 'Wire',
            color: null,
            gauge: null,
            conductor_count: 1,
            actual_length_mm: null,
            notes: null,
            route_points: createOrthogonalRoute(
                terminalPoint(
                    source,
                    sourceDefinition,
                    connection.sourceHandle,
                ),
                terminalPoint(
                    target,
                    targetDefinition,
                    connection.targetHandle,
                ),
            ),
        };
        onChange(
            { ...layout, connections: [...layout.connections, wire] },
            true,
        );
        onSelectionChange({ type: 'connection', id: wire.portable_id });
    }

    function drop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();

        if (layoutReadOnly) {
            return;
        }

        const definitionId = Number(
            event.dataTransfer.getData('application/lighting-definition') ||
                event.dataTransfer.getData('application/lighting-component'),
        );

        if (!instance || !Number.isFinite(definitionId) || definitionId === 0) {
            return;
        }

        onDropDefinition(
            definitionId,
            canvasPointToMm(
                instance.screenToFlowPosition({
                    x: event.clientX,
                    y: event.clientY,
                }),
            ),
        );
    }

    return (
        <div
            className="relative h-full min-h-[400px] w-full bg-muted/40"
            data-testid="lighting-canvas"
            onDrop={drop}
            onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
            }}
        >
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodeOrigin={[0, 0]}
                nodesDraggable={!layoutReadOnly}
                connectionMode={ConnectionMode.Loose}
                onInit={initialize}
                onMove={(_event, viewport) => onZoomChange?.(viewport.zoom)}
                onNodesChange={changeSelected}
                onEdgesChange={changeSelected}
                onNodeDrag={(_event, node, dragged) =>
                    moveNodes(dragged.length ? dragged : [node], false)
                }
                onNodeDragStop={(_event, node, dragged) =>
                    moveNodes(dragged.length ? dragged : [node], true)
                }
                onNodeClick={(_event, node) =>
                    onSelectionChange(selectionFromId(node.id))
                }
                onEdgeClick={(_event, edge) =>
                    onSelectionChange(selectionFromId(edge.id))
                }
                onSelectionChange={selectionChanged}
                onPaneClick={() => {
                    setSelectedIds([]);
                    onSelectionChange(null);
                    onSelectedObjectsChange?.([]);
                }}
                onConnect={connect}
                isValidConnection={(connection) =>
                    connection.source !== connection.target ||
                    connection.sourceHandle !== connection.targetHandle
                }
                minZoom={0.08}
                maxZoom={4}
                deleteKeyCode={null}
                multiSelectionKeyCode="Shift"
                selectionOnDrag
                selectionMode={SelectionMode.Partial}
                panOnDrag={[1, 2]}
                panOnScroll={false}
                zoomOnScroll
                zoomOnDoubleClick={false}
                elevateNodesOnSelect={false}
                proOptions={{ hideAttribution: true }}
            >
                <ExternalCablingLayer
                    layout={layout}
                    selection={selection}
                    onSelectionChange={onSelectionChange}
                    onChange={onChange}
                    visible={showExternalCabling}
                    showLabels={showCableLabels}
                />
            </ReactFlow>
            <div className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-24px)] rounded border bg-background/90 px-3 py-2 text-xs text-muted-foreground">
                Connect terminals to add wiring · Scroll to zoom · Middle/right
                drag to pan
                {selection?.type === 'connection' && (
                    <span className="block">
                        Wire: drag dots to route · double-click segment dot to
                        add bends · right-click bend to remove
                    </span>
                )}
            </div>
        </div>
    );
}
