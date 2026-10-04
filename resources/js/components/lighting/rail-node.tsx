import type { Node, NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { DesignRail } from './types';

export type PhysicalRailNode = Node<
    { rail: DesignRail; warning: boolean; showLabels: boolean },
    'rail'
>;

export default function RailNode({
    data,
    selected,
}: NodeProps<PhysicalRailNode>) {
    return (
        <div
            className={cn(
                'relative h-full w-full border border-slate-400 bg-slate-200 dark:border-slate-600 dark:bg-slate-700',
                selected && 'outline-3 outline-primary',
                data.warning && 'outline-3 outline-destructive',
            )}
            title={`DIN rail · ${data.rail.length_mm} × ${data.rail.width_mm} mm`}
            data-testid={`lighting-rail-${data.rail.portable_id}`}
            data-rail-id={data.rail.portable_id}
        >
            <div
                className="absolute inset-x-0 top-1/4 h-1/2 border-y-4 border-slate-400 bg-slate-300 dark:border-slate-500 dark:bg-slate-600"
                style={{
                    backgroundImage:
                        'repeating-linear-gradient(90deg, transparent 0 48px, rgb(100 116 139 / .6) 48px 72px, transparent 72px 100px)',
                }}
            />
            {data.showLabels && (
                <span className="pointer-events-none absolute bottom-0 left-2 text-[12px] text-slate-700 dark:text-slate-100">
                    DIN rail · {data.rail.length_mm} mm
                </span>
            )}
        </div>
    );
}
