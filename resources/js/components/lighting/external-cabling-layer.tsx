import { useReactFlow, useViewport, ViewportPortal } from '@xyflow/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { cableClassStyle } from './cabling-style';
import {
    bundleBreakoutPoint,
    cableEntryPoint,
    clampCableEntryOffset,
} from './external-cabling';
import {
    canvasPointToMm,
    mmPointToCanvas,
    mmToCanvas,
    orthogonalRoutePath,
    snapPoint,
    updateRouteEndpoints,
} from './geometry';
import { RouteControls } from './route-controls';
import type {
    CableBundle,
    CableEntry,
    LightingLayout,
    LightingSelection,
    MmPoint,
} from './types';

type CablingLayerProps = {
    layout: LightingLayout;
    selection: LightingSelection;
    onSelectionChange: (selection: LightingSelection) => void;
    onChange: (layout: LightingLayout, commit?: boolean) => void;
    visible: boolean;
    showLabels: boolean;
};

export function ExternalCablingLayer({
    layout,
    selection,
    onSelectionChange,
    onChange,
    visible,
    showLabels,
}: CablingLayerProps) {
    const { screenToFlowPosition } = useReactFlow();
    const { zoom } = useViewport();

    function drag(
        event: ReactPointerEvent<SVGElement>,
        update: (point: MmPoint) => LightingLayout,
    ) {
        if (event.button !== 0) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        const origin = { x: event.clientX, y: event.clientY };
        let next = layout;
        let moved = false;

        function move(pointer: PointerEvent) {
            if (
                !moved &&
                Math.hypot(
                    pointer.clientX - origin.x,
                    pointer.clientY - origin.y,
                ) < 3
            ) {
                return;
            }

            moved = true;
            next = update(
                canvasPointToMm(
                    screenToFlowPosition({
                        x: pointer.clientX,
                        y: pointer.clientY,
                    }),
                ),
            );
            onChange(next, false);
        }

        function cancel(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish({ type: 'pointercancel' });
            }
        }

        function finish(pointer: Pick<PointerEvent, 'type'>) {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            window.removeEventListener('keydown', cancel);

            if (moved) {
                onChange(
                    pointer.type === 'pointercancel' ? layout : next,
                    pointer.type !== 'pointercancel',
                );
            }
        }

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish, { once: true });
        window.addEventListener('pointercancel', finish, { once: true });
        window.addEventListener('keydown', cancel);
    }

    function dragEntry(
        event: ReactPointerEvent<SVGRectElement>,
        entry: CableEntry,
    ) {
        onSelectionChange({ type: 'cable_entry', id: entry.portable_id });
        const horizontal = entry.side === 'top' || entry.side === 'bottom';
        const initial = canvasPointToMm(
            screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        );
        drag(event, (point) => {
            const offset_mm = clampCableEntryOffset(
                {
                    ...entry,
                    offset_mm:
                        entry.offset_mm +
                        (horizontal
                            ? point.x_mm - initial.x_mm
                            : point.y_mm - initial.y_mm),
                },
                layout.design,
            );

            return {
                ...layout,
                cable_entries: layout.cable_entries.map((item) =>
                    item.portable_id === entry.portable_id
                        ? { ...item, offset_mm }
                        : item,
                ),
            };
        });
    }

    function updateTrunk(
        bundle: CableBundle,
        points: MmPoint[],
        commit: boolean,
    ) {
        onChange(
            {
                ...layout,
                cable_bundles: layout.cable_bundles.map((item) =>
                    item.portable_id === bundle.portable_id
                        ? { ...item, route_points: points }
                        : item,
                ),
            },
            commit,
        );
    }

    return (
        <ViewportPortal>
            <svg
                className="pointer-events-none absolute top-0 left-0 overflow-visible"
                width={mmToCanvas(layout.design.width_mm)}
                height={mmToCanvas(layout.design.height_mm)}
                style={{ zIndex: 6 }}
                aria-label="External cabling routes"
            >
                {visible &&
                    layout.cable_bundles.map((bundle) => {
                        const selected =
                            selection?.type === 'cable_bundle' &&
                            selection.id === bundle.portable_id;
                        const style = cableClassStyle(bundle.cable_class);
                        const path = orthogonalRoutePath(bundle.route_points);

                        return (
                            <g
                                key={bundle.portable_id}
                                className="nodrag nopan"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onSelectionChange({
                                        type: 'cable_bundle',
                                        id: bundle.portable_id,
                                    });
                                }}
                            >
                                <path
                                    d={path}
                                    fill="none"
                                    stroke="transparent"
                                    strokeWidth={20 / zoom}
                                    style={{
                                        pointerEvents: 'stroke',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <title>
                                        {bundle.name} · {style.label} ·{' '}
                                        {bundle.direction}
                                    </title>
                                </path>
                                <path
                                    data-testid={`lighting-bundle-trunk-${bundle.portable_id}`}
                                    d={path}
                                    fill="none"
                                    stroke={
                                        selected
                                            ? '#93c5fd'
                                            : (bundle.display_color ??
                                              style.color)
                                    }
                                    strokeWidth={selected ? 7 : 5}
                                    strokeDasharray={style.dash}
                                    vectorEffect="non-scaling-stroke"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    style={{
                                        pointerEvents: 'stroke',
                                        cursor: 'pointer',
                                    }}
                                />
                            </g>
                        );
                    })}
                {visible &&
                    layout.external_cables.map((cable) => {
                        if (cable.branch_route_points.length < 2) {
                            return null;
                        }

                        const bundle = layout.cable_bundles.find(
                            (item) =>
                                item.portable_id === cable.bundle_portable_id,
                        );
                        const style = cableClassStyle(
                            bundle?.cable_class ?? cable.cable_class,
                        );
                        const selected =
                            selection?.type === 'external_cable' &&
                            selection.id === cable.portable_id;
                        const path = orthogonalRoutePath(
                            cable.branch_route_points,
                        );

                        return (
                            <g
                                key={cable.portable_id}
                                className="nodrag nopan"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onSelectionChange({
                                        type: 'external_cable',
                                        id: cable.portable_id,
                                    });
                                }}
                            >
                                <path
                                    d={path}
                                    fill="none"
                                    stroke="transparent"
                                    strokeWidth={16 / zoom}
                                    style={{
                                        pointerEvents: 'stroke',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <title>
                                        {cable.label} · {cable.cable_type} ·{' '}
                                        {style.label}
                                    </title>
                                </path>
                                <path
                                    data-testid={`lighting-external-cable-${cable.portable_id}`}
                                    d={path}
                                    fill="none"
                                    stroke={
                                        selected
                                            ? '#93c5fd'
                                            : (bundle?.display_color ??
                                              style.color)
                                    }
                                    strokeWidth={selected ? 3.5 : 1.8}
                                    strokeDasharray={style.dash}
                                    vectorEffect="non-scaling-stroke"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    opacity={selected ? 1 : 0.75}
                                    style={{
                                        pointerEvents: 'stroke',
                                        cursor: 'pointer',
                                    }}
                                />
                            </g>
                        );
                    })}

                {visible &&
                    layout.cable_bundles.map((bundle) => {
                        const selected =
                            selection?.type === 'cable_bundle' &&
                            selection.id === bundle.portable_id;
                        const style = cableClassStyle(bundle.cable_class);
                        const breakout = bundleBreakoutPoint(bundle);
                        const canvas = breakout
                            ? mmPointToCanvas(breakout)
                            : null;

                        return (
                            <g
                                key={bundle.portable_id}
                                className="nodrag nopan"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onSelectionChange({
                                        type: 'cable_bundle',
                                        id: bundle.portable_id,
                                    });
                                }}
                            >
                                {canvas && (
                                    <circle
                                        cx={canvas.x}
                                        cy={canvas.y}
                                        r={(selected ? 6 : 4) / zoom}
                                        fill={
                                            bundle.display_color ?? style.color
                                        }
                                        stroke="#191c22"
                                        strokeWidth={2 / zoom}
                                        style={{
                                            pointerEvents: 'all',
                                            cursor: 'move',
                                        }}
                                        role="button"
                                        aria-label={`Move ${bundle.name} breakout`}
                                        data-testid={`lighting-bundle-breakout-${bundle.portable_id}`}
                                        onPointerDown={(event) => {
                                            onSelectionChange({
                                                type: 'cable_bundle',
                                                id: bundle.portable_id,
                                            });
                                            drag(event, (point) => {
                                                const target = layout.design
                                                    .snap_to_grid
                                                    ? snapPoint(
                                                          point,
                                                          layout.design
                                                              .grid_size_mm,
                                                      )
                                                    : point;
                                                const end = {
                                                    x_mm: Math.max(
                                                        0,
                                                        Math.min(
                                                            layout.design
                                                                .width_mm,
                                                            target.x_mm,
                                                        ),
                                                    ),
                                                    y_mm: Math.max(
                                                        0,
                                                        Math.min(
                                                            layout.design
                                                                .height_mm,
                                                            target.y_mm,
                                                        ),
                                                    ),
                                                };

                                                return {
                                                    ...layout,
                                                    cable_bundles:
                                                        layout.cable_bundles.map(
                                                            (item) =>
                                                                item.portable_id ===
                                                                bundle.portable_id
                                                                    ? {
                                                                          ...item,
                                                                          route_points:
                                                                              updateRouteEndpoints(
                                                                                  item.route_points,
                                                                                  item
                                                                                      .route_points[0],
                                                                                  end,
                                                                              ),
                                                                      }
                                                                    : item,
                                                        ),
                                                };
                                            });
                                        }}
                                    >
                                        <title>
                                            Drag breakout to move the shared
                                            branching point
                                        </title>
                                    </circle>
                                )}
                            </g>
                        );
                    })}
                {visible &&
                    layout.cable_bundles.map((bundle) => {
                        const selected =
                            selection?.type === 'cable_bundle' &&
                            selection.id === bundle.portable_id;

                        return (
                            <g key={bundle.portable_id}>
                                {selected && (
                                    <RouteControls
                                        points={bundle.route_points}
                                        gridSize={layout.design.grid_size_mm}
                                        snap={layout.design.snap_to_grid}
                                        onRoute={(points, commit) =>
                                            updateTrunk(bundle, points, commit)
                                        }
                                        testId="lighting-bundle"
                                        objectId={bundle.portable_id}
                                        label="bundle trunk"
                                    />
                                )}
                            </g>
                        );
                    })}
                {visible &&
                    layout.external_cables.map((cable) => {
                        const selected =
                            selection?.type === 'external_cable' &&
                            selection.id === cable.portable_id;

                        return (
                            <g key={cable.portable_id}>
                                {selected && (
                                    <RouteControls
                                        points={cable.branch_route_points}
                                        gridSize={layout.design.grid_size_mm}
                                        snap={layout.design.snap_to_grid}
                                        onRoute={(
                                            branch_route_points,
                                            commit,
                                        ) =>
                                            onChange(
                                                {
                                                    ...layout,
                                                    external_cables:
                                                        layout.external_cables.map(
                                                            (item) =>
                                                                item.portable_id ===
                                                                cable.portable_id
                                                                    ? {
                                                                          ...item,
                                                                          branch_route_points,
                                                                      }
                                                                    : item,
                                                        ),
                                                },
                                                commit,
                                            )
                                        }
                                        testId="lighting-external-cable"
                                        objectId={cable.portable_id}
                                        label="cable branch"
                                    />
                                )}
                            </g>
                        );
                    })}
                {layout.cable_entries.map((entry) => {
                    const point = cableEntryPoint(entry, layout.design);
                    const canvas = mmPointToCanvas(point);
                    const horizontal =
                        entry.side === 'top' || entry.side === 'bottom';
                    const selected =
                        selection?.type === 'cable_entry' &&
                        selection.id === entry.portable_id;

                    return (
                        <rect
                            key={entry.portable_id}
                            className="nodrag nopan"
                            x={
                                canvas.x -
                                (horizontal
                                    ? mmToCanvas(entry.span_mm) / 2
                                    : 6 / zoom)
                            }
                            y={
                                canvas.y -
                                (horizontal
                                    ? 6 / zoom
                                    : mmToCanvas(entry.span_mm) / 2)
                            }
                            width={
                                horizontal
                                    ? mmToCanvas(entry.span_mm)
                                    : 12 / zoom
                            }
                            height={
                                horizontal
                                    ? 12 / zoom
                                    : mmToCanvas(entry.span_mm)
                            }
                            rx={3 / zoom}
                            fill={selected ? '#60a5fa' : '#475569'}
                            stroke={selected ? '#bfdbfe' : '#94a3b8'}
                            strokeWidth={1.5 / zoom}
                            style={{
                                pointerEvents: 'all',
                                cursor: horizontal ? 'ew-resize' : 'ns-resize',
                            }}
                            opacity={visible || selected ? 1 : 0.6}
                            role="button"
                            aria-label={`Cable entry ${entry.label}`}
                            tabIndex={0}
                            data-testid={`lighting-cable-entry-${entry.portable_id}`}
                            data-side={entry.side}
                            data-x-mm={point.x_mm}
                            data-y-mm={point.y_mm}
                            onPointerDown={(event) => dragEntry(event, entry)}
                            onClick={(event) => {
                                event.stopPropagation();
                                onSelectionChange({
                                    type: 'cable_entry',
                                    id: entry.portable_id,
                                });
                            }}
                            onKeyDown={(event) => {
                                if (
                                    event.key === 'Enter' ||
                                    event.key === ' '
                                ) {
                                    event.preventDefault();
                                    onSelectionChange({
                                        type: 'cable_entry',
                                        id: entry.portable_id,
                                    });
                                }
                            }}
                        >
                            <title>
                                {entry.label} · {entry.side} opening · drag
                                along edge
                            </title>
                        </rect>
                    );
                })}
            </svg>
            {visible &&
                layout.cable_bundles.map((bundle) => {
                    const selected =
                        selection?.type === 'cable_bundle' &&
                        selection.id === bundle.portable_id;
                    const breakout = bundleBreakoutPoint(bundle);

                    if ((!showLabels && !selected) || !breakout) {
                        return null;
                    }

                    const style = cableClassStyle(bundle.cable_class);
                    const point = mmPointToCanvas(breakout);
                    const count = layout.external_cables.filter(
                        (item) =>
                            item.bundle_portable_id === bundle.portable_id,
                    ).length;

                    return (
                        <button
                            key={bundle.portable_id}
                            type="button"
                            className="nodrag nopan pointer-events-auto absolute flex items-center gap-2 rounded-md border border-white/15 bg-[#202631]/95 px-3 py-2 text-left text-slate-200 shadow-lg"
                            style={{
                                left: point.x + 12 / zoom,
                                top: point.y - 12 / zoom,
                                transformOrigin: 'top left',
                                transform: `scale(${1 / zoom})`,
                                zIndex: 7,
                            }}
                            onClick={() =>
                                onSelectionChange({
                                    type: 'cable_bundle',
                                    id: bundle.portable_id,
                                })
                            }
                        >
                            <style.icon
                                className="size-4"
                                style={{
                                    color: bundle.display_color ?? style.color,
                                }}
                            />
                            <span className="text-xs font-medium whitespace-nowrap">
                                {bundle.name}
                                <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
                                    {style.short} · {count} defined
                                    {bundle.planned_count !== null
                                        ? ` / ${bundle.planned_count} planned`
                                        : ''}
                                </span>
                            </span>
                        </button>
                    );
                })}
            {layout.cable_entries
                .filter(
                    (entry) =>
                        selection?.type === 'cable_entry' &&
                        selection.id === entry.portable_id,
                )
                .map((entry) => {
                    const point = mmPointToCanvas(
                        cableEntryPoint(entry, layout.design),
                    );

                    return (
                        <span
                            key={entry.portable_id}
                            className="pointer-events-none absolute rounded border border-white/15 bg-[#202631] px-3 py-1.5 text-xs text-slate-200 shadow-lg"
                            style={{
                                left: point.x + 12 / zoom,
                                top: point.y + 12 / zoom,
                                transformOrigin: 'top left',
                                transform: `scale(${1 / zoom})`,
                                zIndex: 8,
                            }}
                        >
                            {entry.label}
                        </span>
                    );
                })}
            {visible &&
                layout.external_cables
                    .filter(
                        (cable) =>
                            selection?.type === 'external_cable' &&
                            selection.id === cable.portable_id &&
                            cable.branch_route_points.length > 1,
                    )
                    .map((cable) => {
                        const point = mmPointToCanvas(
                            cable.branch_route_points.at(-1)!,
                        );

                        return (
                            <span
                                key={cable.portable_id}
                                className="pointer-events-none absolute rounded border border-white/15 bg-[#202631] px-3 py-1.5 text-xs text-slate-200 shadow-lg"
                                style={{
                                    left: point.x + 12 / zoom,
                                    top: point.y + 12 / zoom,
                                    transformOrigin: 'top left',
                                    transform: `scale(${1 / zoom})`,
                                    zIndex: 8,
                                }}
                            >
                                {cable.label}
                            </span>
                        );
                    })}
        </ViewportPortal>
    );
}
