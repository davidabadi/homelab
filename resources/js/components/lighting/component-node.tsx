import { useUpdateNodeInternals } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ComponentImage } from './component-image';
import { mmToCanvas } from './geometry';
import TerminalHandle from './terminal-handle';
import type { ComponentDefinition, PlacedComponent } from './types';

export type PhysicalComponentNode = Node<
    {
        component: PlacedComponent;
        definition: ComponentDefinition;
        warning: boolean;
        showLabels: boolean;
    },
    'component'
>;

export default function ComponentNode({
    id,
    data,
    selected,
}: NodeProps<PhysicalComponentNode>) {
    const { component, definition, warning, showLabels } = data;
    const updateNodeInternals = useUpdateNodeInternals();
    useEffect(() => {
        updateNodeInternals(id);
    }, [
        id,
        component.rotation,
        definition.id,
        definition.terminals,
        updateNodeInternals,
    ]);
    const rotation = ((component.rotation % 360) + 360) % 360;
    const offsetX =
        rotation === 90
            ? definition.height_mm
            : rotation === 180
              ? definition.width_mm
              : 0;
    const offsetY =
        rotation === 180
            ? definition.height_mm
            : rotation === 270
              ? definition.width_mm
              : 0;

    return (
        <div
            className={cn(
                'relative h-full w-full border border-border bg-card shadow-sm',
                selected && 'outline-3 outline-primary',
                warning && 'border-destructive outline-3 outline-destructive',
            )}
            title={`${component.custom_label ?? definition.display_name} · ${definition.width_mm} × ${definition.height_mm} mm${warning ? ' · Outside usable enclosure area' : ''}`}
            data-testid={`lighting-component-${component.portable_id}`}
            data-component-id={component.portable_id}
            data-x-mm={component.x_mm}
            data-y-mm={component.y_mm}
            data-rail-id={component.rail_portable_id ?? ''}
            data-outside-enclosure={warning}
        >
            <div
                className="absolute overflow-hidden"
                style={{
                    width: mmToCanvas(definition.width_mm),
                    height: mmToCanvas(definition.height_mm),
                    transformOrigin: 'top left',
                    transform: `translate(${mmToCanvas(offsetX)}px, ${mmToCanvas(offsetY)}px) rotate(${rotation}deg)`,
                }}
            >
                <ComponentImage
                    definition={definition}
                    className="pointer-events-none h-full w-full"
                />
            </div>
            {showLabels && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden bg-background/85 px-1 text-center text-[12px] leading-5 font-medium text-foreground">
                    {component.custom_label ?? definition.model}
                </div>
            )}
            {component.rail_portable_id && (
                <span className="pointer-events-none absolute top-1 right-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">
                    DIN
                </span>
            )}
            {definition.terminals.map((terminal) => (
                <TerminalHandle
                    key={terminal.key}
                    terminal={terminal}
                    definition={definition}
                    rotation={rotation}
                    componentId={component.portable_id}
                />
            ))}
        </div>
    );
}
