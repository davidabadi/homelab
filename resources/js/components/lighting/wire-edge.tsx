import { BaseEdge, EdgeLabelRenderer, useViewport } from '@xyflow/react';
import type { Edge, EdgeProps } from '@xyflow/react';
import {
    cableLengthMm,
    mmPointToCanvas,
    orthogonalRoutePath,
} from './geometry';
import { RouteControls } from './route-controls';
import type { DesignConnection, MmPoint } from './types';

export type PhysicalWireEdge = Edge<
    {
        connection: DesignConnection;
        gridSize: number;
        snap: boolean;
        showLabels: boolean;
        dimmed: boolean;
        onRoute: (points: MmPoint[], commit: boolean) => void;
    },
    'wire'
>;

export default function WireEdge({
    id,
    data,
    selected,
}: EdgeProps<PhysicalWireEdge>) {
    const { zoom } = useViewport();

    if (!data) {
        return null;
    }

    const { connection, onRoute, gridSize, snap, showLabels, dimmed } = data;
    const points = connection.route_points;
    const middle = points[Math.floor(points.length / 2)];
    const label = middle ? mmPointToCanvas(middle) : { x: 0, y: 0 };
    const length = (cableLengthMm(points) / 1000).toFixed(2);
    const caption = `${connection.cable_type} · ${connection.conductor_count} conductor${connection.conductor_count === 1 ? '' : 's'}${connection.gauge ? ` · ${connection.gauge}` : ''} · ${length} m`;

    return (
        <>
            <BaseEdge
                id={id}
                data-testid={`lighting-wire-${connection.portable_id}`}
                path={orthogonalRoutePath(points)}
                interactionWidth={20 / zoom}
                vectorEffect="non-scaling-stroke"
                style={{
                    stroke: selected
                        ? 'var(--primary)'
                        : (connection.color ?? '#64748b'),
                    strokeWidth: selected ? 5 : 3,
                    opacity: dimmed ? 0.4 : 1,
                }}
            />
            <title>{caption}</title>
            {selected && (
                <RouteControls
                    points={points}
                    gridSize={gridSize}
                    snap={snap}
                    onRoute={onRoute}
                    testId="lighting-wire"
                    objectId={connection.portable_id}
                    label="wire"
                />
            )}
            {(selected || showLabels) && (
                <EdgeLabelRenderer>
                    <div
                        className="nodrag nopan pointer-events-none absolute rounded border border-border bg-background/90 px-1.5 py-0.5 text-[11px] text-foreground"
                        style={{
                            transform: `translate(-50%, -150%) translate(${label.x}px, ${label.y}px)`,
                            fontSize: Math.max(11, 9 / zoom),
                            opacity: dimmed ? 0.55 : 1,
                        }}
                    >
                        {connection.cable_type} · {length} m
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}
