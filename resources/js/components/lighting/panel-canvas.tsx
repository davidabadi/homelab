import {
    ConnectionMode,
    ReactFlow,
    SelectionMode,
    useViewport,
    ViewportPortal,
} from '@xyflow/react';
import type {
    Connection,
    EdgeChange,
    Node,
    NodeChange,
    ReactFlowInstance,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import ComponentNode from './component-node';
import { describeLightingRoute } from './connection-lookup';
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
    orthogonalRoutePath,
} from './geometry';
import RailNode from './rail-node';
import {
    buildWiringRoutes,
    findRoutesNearPoint,
    isRouteSelection,
    routeSelectionKey,
    screenToleranceMm,
} from './route-hit-testing';
import type { RouteSelection, WiringRoute } from './route-hit-testing';
import { findRouteOverlaps } from './route-overlap';
import { RoutePicker } from './route-picker';
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

function RouteInspectionLayer({
    routes,
    selection,
    layout,
    onInspect,
}: {
    routes: WiringRoute[];
    selection: LightingSelection;
    layout: LightingLayout;
    onInspect: (
        selections: RouteSelection[],
        position: { x: number; y: number },
    ) => void;
}) {
    const { zoom } = useViewport();
    const focused = routes.find(
        (route) =>
            route.selection.type === selection?.type &&
            route.selection.id === selection?.id,
    );
    const overlaps = useMemo(() => findRouteOverlaps(routes), [routes]);
    const displayedGroups = new Set<string>();
    const badges = [...overlaps]
        .sort(
            (left, right) =>
                Math.hypot(
                    right.end.x_mm - right.start.x_mm,
                    right.end.y_mm - right.start.y_mm,
                ) -
                Math.hypot(
                    left.end.x_mm - left.start.x_mm,
                    left.end.y_mm - left.start.y_mm,
                ),
        )
        .filter((overlap) => {
            const length = Math.hypot(
                overlap.end.x_mm - overlap.start.x_mm,
                overlap.end.y_mm - overlap.start.y_mm,
            );
            const group = overlap.selections.map(routeSelectionKey).join('|');

            if (mmToCanvas(length) * zoom < 44 || displayedGroups.has(group)) {
                return false;
            }

            displayedGroups.add(group);

            return true;
        });

    return (
        <ViewportPortal>
            {focused && (
                <svg
                    className="pointer-events-none absolute top-0 left-0 overflow-visible"
                    width={mmToCanvas(layout.design.width_mm)}
                    height={mmToCanvas(layout.design.height_mm)}
                    style={{ zIndex: 7 }}
                    data-testid="lighting-route-focus"
                    data-route-type={focused.selection.type}
                    data-route-id={focused.selection.id}
                    aria-hidden="true"
                >
                    {focused.paths.map((points, index) => (
                        <g key={index}>
                            <path
                                d={orthogonalRoutePath(points)}
                                fill="none"
                                stroke="#191c22"
                                strokeWidth={9}
                                vectorEffect="non-scaling-stroke"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                d={orthogonalRoutePath(points)}
                                fill="none"
                                stroke="#60a5fa"
                                strokeOpacity={0.25}
                                strokeWidth={8}
                                vectorEffect="non-scaling-stroke"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                d={orthogonalRoutePath(points)}
                                fill="none"
                                stroke="#bfdbfe"
                                strokeWidth={3.5}
                                vectorEffect="non-scaling-stroke"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </g>
                    ))}
                    {focused.paths.flatMap((points, index) =>
                        points.length > 1
                            ? [points[0], points.at(-1)!].map((point, end) => {
                                  const canvas = mmPointToCanvas(point);

                                  return (
                                      <circle
                                          key={`${index}:${end}`}
                                          cx={canvas.x}
                                          cy={canvas.y}
                                          r={4 / zoom}
                                          fill="#bfdbfe"
                                          stroke="#191c22"
                                          strokeWidth={2}
                                          vectorEffect="non-scaling-stroke"
                                      />
                                  );
                              })
                            : [],
                    )}
                </svg>
            )}
            {badges.map((overlap) => {
                const midpoint = {
                    x_mm: (overlap.start.x_mm + overlap.end.x_mm) / 2,
                    y_mm: (overlap.start.y_mm + overlap.end.y_mm) / 2,
                };
                const canvas = mmPointToCanvas(midpoint);
                const candidates = findRoutesNearPoint(
                    routes,
                    midpoint,
                    screenToleranceMm(8, zoom),
                );

                return (
                    <button
                        key={`${midpoint.x_mm}:${midpoint.y_mm}`}
                        type="button"
                        className="nodrag nopan absolute flex h-5 min-w-6 items-center justify-center rounded-md border border-blue-300/40 bg-[#24334a] px-1.5 text-[11px] font-semibold text-blue-100 shadow-sm hover:border-blue-200 hover:bg-[#30445f] focus-visible:outline-2 focus-visible:outline-blue-300"
                        style={{
                            left: canvas.x,
                            top: canvas.y,
                            transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                            zIndex: 9,
                        }}
                        data-route-inspection-control
                        data-testid="lighting-route-overlap"
                        data-route-count={overlap.selections.length}
                        aria-label={`${overlap.selections.length} overlapping routes. Choose a cable`}
                        title={`${overlap.selections.length} routes share this section`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            const box =
                                event.currentTarget.getBoundingClientRect();
                            onInspect(candidates, {
                                x: box.right + 8,
                                y: box.top,
                            });
                        }}
                    >
                        {overlap.selections.length}
                    </button>
                );
            })}
        </ViewportPortal>
    );
}

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
    const [canvasSelection, setCanvasSelection] = useState<{
        primary: LightingSelection;
        ids: string[];
    }>({ primary: null, ids: [] });
    const selectedIds = useMemo(
        () =>
            canvasSelection.primary === selection
                ? canvasSelection.ids
                : selection
                  ? [`${selection.type}:${selection.id}`]
                  : [],
        [canvasSelection, selection],
    );
    const [picker, setPicker] = useState<{
        selections: RouteSelection[];
        position: { x: number; y: number };
        additive: boolean;
    } | null>(null);
    const pointerStart = useRef<{ x: number; y: number } | null>(null);
    const routes = useMemo(
        () =>
            buildWiringRoutes(layout, {
                internal: showWires,
                external: showExternalCabling,
            }),
        [layout, showWires, showExternalCabling],
    );
    const routeFocused = isRouteSelection(selection);
    const endpointIds = useMemo(() => {
        if (selection?.type === 'connection') {
            const connection = layout.connections.find(
                (item) => item.portable_id === selection.id,
            );

            return connection
                ? [connection.source_portable_id, connection.target_portable_id]
                : [];
        }

        if (selection?.type === 'external_cable') {
            const cable = layout.external_cables.find(
                (item) => item.portable_id === selection.id,
            );

            return cable?.internal_component_portable_id
                ? [cable.internal_component_portable_id]
                : [];
        }

        return [];
    }, [layout, selection]);
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
                        routeEndpoint: endpointIds.includes(
                            component.portable_id,
                        ),
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
    }, [layout, selected, showGrid, showLabels, endpointIds]);

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
                    dimmed:
                        routeFocused &&
                        !selected('connection', connection.portable_id),
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
        [layout, onChange, selected, showCableLabels, showWires, routeFocused],
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
        const primary = identifiers.at(-1);
        publishCanvasSelection(
            primary ? selectionFromId(primary) : null,
            identifiers,
        );
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
        publishCanvasSelection({ type: 'connection', id: wire.portable_id });
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

    function publishCanvasSelection(
        next: LightingSelection,
        identifiers = next ? [`${next.type}:${next.id}`] : [],
    ) {
        setCanvasSelection({ primary: next, ids: identifiers });
        onSelectionChange(next);
    }

    function selectRoute(next: LightingSelection) {
        if (!isRouteSelection(next)) {
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
        const identifiers = picker?.additive
            ? [...new Set([...activeIds, routeSelectionKey(next)])]
            : [routeSelectionKey(next)];
        setPicker(null);
        publishCanvasSelection(next, identifiers);
        onSelectedObjectsChange?.(
            identifiers.flatMap((id) => {
                const object = selectionFromId(id);

                return object ? [object] : [];
            }),
        );
    }

    function inspectRoutes(
        candidates: RouteSelection[],
        position: { x: number; y: number },
        additive = false,
    ) {
        if (candidates.length === 1) {
            selectRoute(candidates[0]);
        } else if (candidates.length > 1) {
            setPicker({ selections: candidates, position, additive });
        }
    }

    function captureRouteClick(event: MouseEvent<HTMLDivElement>) {
        const target = event.target;

        if (
            !instance ||
            event.button !== 0 ||
            !(target instanceof Element) ||
            !event.currentTarget.contains(target) ||
            target.closest(
                '.react-flow__node, .react-flow__handle, [data-testid="wire-route-controls"], [data-route-interaction-control], [data-route-inspection-control], [role="dialog"]',
            )
        ) {
            return;
        }

        if (
            pointerStart.current &&
            Math.hypot(
                event.clientX - pointerStart.current.x,
                event.clientY - pointerStart.current.y,
            ) > 3
        ) {
            return;
        }

        const point = canvasPointToMm(
            instance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            }),
        );
        const candidates = findRoutesNearPoint(
            routes,
            point,
            screenToleranceMm(10, instance.getZoom()),
        );

        if (
            candidates.length === 0 ||
            (event.shiftKey && candidates.length === 1)
        ) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        inspectRoutes(
            candidates,
            { x: event.clientX, y: event.clientY },
            event.shiftKey,
        );
    }

    return (
        <div
            className="relative h-full min-h-[400px] w-full bg-muted/40"
            data-testid="lighting-canvas"
            onPointerDownCapture={(event) => {
                pointerStart.current = { x: event.clientX, y: event.clientY };
            }}
            onClickCapture={captureRouteClick}
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
                onNodeClick={(event, node) => {
                    if (!event.shiftKey) {
                        publishCanvasSelection(
                            selectionFromId(node.id),
                            selectedIds.includes(node.id)
                                ? selectedIds
                                : [node.id],
                        );
                    }
                }}
                onEdgeClick={(event, edge) => {
                    if (!event.shiftKey) {
                        publishCanvasSelection(
                            selectionFromId(edge.id),
                            selectedIds.includes(edge.id)
                                ? selectedIds
                                : [edge.id],
                        );
                    }
                }}
                onSelectionChange={selectionChanged}
                onPaneClick={() => {
                    setPicker(null);
                    publishCanvasSelection(null);
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
                    onSelectionChange={publishCanvasSelection}
                    onChange={onChange}
                    visible={showExternalCabling}
                    showLabels={showCableLabels}
                />
                <RouteInspectionLayer
                    routes={routes}
                    selection={selection}
                    layout={layout}
                    onInspect={inspectRoutes}
                />
            </ReactFlow>
            <RoutePicker
                open={picker !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPicker(null);
                    }
                }}
                routes={(picker?.selections ?? []).flatMap((candidate) => {
                    const description = describeLightingRoute(
                        layout,
                        candidate,
                    );

                    return description ? [description] : [];
                })}
                title="Choose a route"
                description="Several cables share this location. Select one to follow its complete route."
                position={picker?.position}
                onSelect={selectRoute}
            />
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
