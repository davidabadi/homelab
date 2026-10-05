import type { Node, NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { DesignDuct } from './types';

export type PhysicalDuctNode = Node<
    { duct: DesignDuct; warning: boolean; showLabels: boolean },
    'duct'
>;

export default function DuctNode({
    data,
    selected,
}: NodeProps<PhysicalDuctNode>) {
    return (
        <div
            className={cn(
                'relative h-full w-full overflow-hidden border-2 border-stone-400 bg-stone-200/80 dark:border-stone-600 dark:bg-stone-800/80',
                selected && 'outline-3 outline-primary',
                data.warning && 'outline-3 outline-destructive',
            )}
            style={{
                backgroundImage: `repeating-linear-gradient(${data.duct.orientation === 'horizontal' ? '90deg' : '0deg'}, transparent 0 16px, rgb(120 113 108 / .3) 16px 24px)`,
            }}
            title={`Wire duct · ${data.duct.length_mm} × ${data.duct.width_mm} mm · ${data.duct.orientation}`}
            data-testid={`lighting-duct-${data.duct.portable_id}`}
            data-duct-id={data.duct.portable_id}
        >
            {data.showLabels && (
                <span className="pointer-events-none absolute top-1 left-1 bg-background/75 px-1 text-[12px] text-foreground">
                    Duct · {data.duct.length_mm} mm
                </span>
            )}
        </div>
    );
}
